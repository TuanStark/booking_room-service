import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { UploadService, UploadResult } from 'src/utils/uploads.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindAllDto } from 'src/common/global/find-all.dto';
import { RoomStatus } from './dto/enum';
import { RabbitMQProducerService } from '../rabbitmq/rabbitmq.producer.service';
import axios, { AxiosError } from 'axios';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BuildingResponse {
  id: string;
  name?: string;
  address?: string;
  [key: string]: any;
}

/** Prisma interactive transaction client */
type TxClient = any;

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly uploadService: UploadService,
    private readonly prisma: PrismaService,
    private readonly rabbitMQService: RabbitMQProducerService,
  ) { }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  async create(
    createRoomDto: CreateRoomDto,
    files: Express.Multer.File[],
  ): Promise<any> {
    // 1. Create room record
    const room = await this.prisma.room.create({
      data: {
        name: createRoomDto.name,
        buildingId: createRoomDto.buildingId,
        price: parseFloat(createRoomDto.price.toString()),
        capacity: parseInt(createRoomDto.capacity.toString()),
        squareMeter: createRoomDto.squareMeters != null
          ? Number(createRoomDto.squareMeters) : undefined,
        description: createRoomDto.description,
        bedCount: createRoomDto.bedCount != null
          ? Number(createRoomDto.bedCount) : undefined,
        bathroomCount: createRoomDto.bathroomCount != null
          ? Number(createRoomDto.bathroomCount) : undefined,
        floor: createRoomDto.floor != null
          ? Number(createRoomDto.floor) : undefined,
        status: 'AVAILABLE',
      },
    });
    this.logger.log(`Room created: ${room.id}`);

    // 2. Upload images (if provided)
    await this.uploadRoomImages(this.prisma, room.id, files);

    // 3. Add amenities (if provided)
    await this.updateRoomAmenities(this.prisma, room.id, createRoomDto.amenities);

    // 4. Fetch full room with relations
    const fullRoom = await this.findFullRoom(room.id);

    // 5. Publish event (fire-and-forget)
    this.publishRoomEvent('room.created', fullRoom);

    return fullRoom;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE — Orchestrator
  // ═══════════════════════════════════════════════════════════════════════════

  async update(
    id: string,
    updateRoomDto: UpdateRoomDto,
    files?: Express.Multer.File[],
  ): Promise<any> {
    // 1. Verify room exists
    const existingRoom = await this.prisma.room.findUnique({ where: { id } });
    if (!existingRoom) {
      throw new NotFoundException(`Room ${id} not found`);
    }

    // 2. Collect deleted image IDs (comes from dto.imageUrls field)
    const deletedImageIds = Array.isArray(updateRoomDto.imageUrls)
      ? updateRoomDto.imageUrls
      : [];

    // 3. Upload new files to storage BEFORE the transaction
    //    (so we don't hold a long transaction open during network calls)
    let uploadedImages: UploadResult[] = [];
    if (files && files.length > 0) {
      uploadedImages = await this.uploadService.uploadImages(files);
      this.logger.log(`Uploaded ${uploadedImages.length} new images to storage`);
    }

    // 4. Delete old images from storage BEFORE the transaction
    //    (storage deletions are idempotent, so safe to do outside tx)
    await this.deleteImagesFromStorage(deletedImageIds);

    // 5. Execute ALL database mutations inside a single transaction
    await this.prisma.$transaction(async (tx) => {
      // 5a. Update primitive room fields
      await this.updateRoomFields(tx, id, updateRoomDto);

      // 5b. Delete image records from DB
      if (deletedImageIds.length > 0) {
        await tx.roomImages.deleteMany({
          where: { id: { in: deletedImageIds } },
        });
        this.logger.log(`Deleted ${deletedImageIds.length} image records from DB`);
      }

      // 5c. Insert new image records into DB
      if (uploadedImages.length > 0) {
        await tx.roomImages.createMany({
          data: uploadedImages.map((img) => ({
            roomId: id,
            imageUrl: img.imageUrl,
            imagePublicId: img.imagePublicId,
          })),
        });
        this.logger.log(`Inserted ${uploadedImages.length} new image records`);
      }

      // 5d. Update amenities
      await this.updateRoomAmenities(tx, id, updateRoomDto.amenities);
    });

    // 6. Fetch the fully updated room with all relations
    const fullRoom = await this.findFullRoom(id);

    // 7. Publish event (fire-and-forget)
    this.publishRoomEvent('room.updated', fullRoom);

    return fullRoom;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READ
  // ═══════════════════════════════════════════════════════════════════════════

  async findAll(query: FindAllDto) {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (pageNumber < 1 || limitNumber < 1) {
      throw new Error('Page and limit must be greater than 0');
    }

    const take = limitNumber;
    const skip = (pageNumber - 1) * take;

    const searchUpCase = search.charAt(0).toUpperCase() + search.slice(1);
    const where = search
      ? {
        OR: [
          { name: { contains: searchUpCase } },
          { address: { contains: searchUpCase } },
        ],
      }
      : {};
    const orderBy = { [sortBy]: sortOrder };

    const [rooms, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { images: true, amenities: true },
      }),
      this.prisma.room.count({ where }),
    ]);

    return {
      data: rooms,
      meta: {
        total,
        pageNumber,
        limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    };
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { images: true, amenities: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    let building: BuildingResponse | null = null;
    try {
      building = await this.fetchBuildingFromService(room.buildingId);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch building ${room.buildingId} for room ${id}: ${error.message}`,
      );
    }

    return { ...room, building };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  async remove(id: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const deletedRoom = await this.prisma.room.delete({
      where: { id },
      include: { images: true, amenities: true },
    });

    // Clean up images from storage (best-effort, don't block)
    for (const img of deletedRoom.images) {
      if (img.imagePublicId) {
        try {
          await this.uploadService.deleteImage(img.imagePublicId);
        } catch (error) {
          this.logger.warn(
            `Failed to delete storage image ${img.imagePublicId}: ${error.message}`,
          );
        }
      }
    }

    this.publishRoomEvent('room.deleted', deletedRoom);
    return { message: 'Deleted successfully' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER — Room Status / Queries (for RabbitMQ consumers)
  // ═══════════════════════════════════════════════════════════════════════════

  async updateRoomStatus(roomId: string, status: RoomStatus) {
    try {
      const room = await this.prisma.room.update({
        where: { id: roomId },
        data: { status },
      });
      this.logger.log(`Room ${roomId} status updated to ${status}`);
      return room;
    } catch (error) {
      this.logger.error(`Failed to update room ${roomId} status: ${error.message}`);
      throw error;
    }
  }

  async getRoomById(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      include: { images: true, amenities: true },
    });
  }

  async getAvailableRooms(buildingId?: string) {
    return this.prisma.room.findMany({
      where: {
        status: RoomStatus.AVAILABLE,
        ...(buildingId && { buildingId }),
      },
      include: { images: true, amenities: true },
    });
  }

  async getBookedRooms(buildingId?: string) {
    return this.prisma.room.findMany({
      where: {
        status: RoomStatus.BOOKED,
        ...(buildingId && { buildingId }),
      },
      include: { images: true, amenities: true },
    });
  }

  async getRoombyBuildingId(buildingId: string) {
    const [rooms, building] = await Promise.all([
      this.prisma.room.findMany({
        where: { buildingId: buildingId.toString() },
        include: { images: true, amenities: true },
      }),
      this.fetchBuildingFromService(buildingId),
    ]);

    if (rooms.length === 0) {
      throw new NotFoundException('Rooms not found');
    }

    return rooms.map((room) => ({
      ...room,
      building,
      buildingName: building?.name,
      buildingAddress: building?.address,
    }));
  }

  /** Get room statistics for the dashboard */
  async getStats() {
    const [total, available, booked, maintenance, disabled] = await Promise.all([
      this.prisma.room.count(),
      this.prisma.room.count({ where: { status: RoomStatus.AVAILABLE } }),
      this.prisma.room.count({ where: { status: RoomStatus.BOOKED } }),
      this.prisma.room.count({ where: { status: RoomStatus.MAINTENANCE } }),
      this.prisma.room.count({ where: { status: RoomStatus.DISABLED } }),
    ]);

    const occupancyRate = total > 0 ? ((total - available) / total) * 100 : 0;

    return {
      totalRooms: total,
      availableRooms: available,
      bookedRooms: booked,
      maintenanceRooms: maintenance,
      disabledRooms: disabled,
      occupancyRate: Math.round(occupancyRate * 100) / 100,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Modular Helpers (Single Responsibility)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update only the primitive scalar fields on a Room record.
   * Skips fields that are undefined in the DTO (partial update).
   */
  private async updateRoomFields(
    tx: TxClient,
    roomId: string,
    dto: UpdateRoomDto,
  ): Promise<void> {
    const updateData: Record<string, any> = {};

    // String fields
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.buildingId !== undefined) updateData.buildingId = dto.buildingId;
    if (dto.description !== undefined) updateData.description = dto.description;

    // Number fields (FormData sends strings, so cast to Number)
    if (dto.price !== undefined) updateData.price = Number(dto.price);
    if (dto.capacity !== undefined) updateData.capacity = Number(dto.capacity);
    if (dto.countCapacity !== undefined) updateData.countCapacity = Number(dto.countCapacity);
    if (dto.squareMeters !== undefined) updateData.squareMeter = Number(dto.squareMeters);
    if (dto.bedCount !== undefined) updateData.bedCount = Number(dto.bedCount);
    if (dto.bathroomCount !== undefined) updateData.bathroomCount = Number(dto.bathroomCount);
    if (dto.floor !== undefined) updateData.floor = Number(dto.floor);

    // Enum field
    if (dto.status !== undefined) updateData.status = dto.status;

    if (Object.keys(updateData).length > 0) {
      await tx.room.update({ where: { id: roomId }, data: updateData });
      this.logger.log(`Room ${roomId}: updated ${Object.keys(updateData).length} fields`);
    }
  }

  /**
   * Delete images from cloud storage by their DB record IDs.
   * Fetches the publicId from the DB, then calls the upload-service delete API.
   * Errors are logged but don't stop the flow (storage is best-effort).
   */
  private async deleteImagesFromStorage(imageIds: string[]): Promise<void> {
    if (imageIds.length === 0) return;

    // Look up which images have a Cloudinary publicId
    const images = await this.prisma.roomImages.findMany({
      where: { id: { in: imageIds } },
      select: { id: true, imagePublicId: true },
    });

    // Delete from storage (best-effort; don't crash if one fails)
    const deletePromises = images
      .filter((img) => !!img.imagePublicId)
      .map((img) =>
        this.uploadService.deleteImage(img.imagePublicId!).catch((err) => {
          this.logger.warn(
            `Failed to delete storage image ${img.imagePublicId}: ${err.message}`,
          );
        }),
      );

    await Promise.allSettled(deletePromises);
    this.logger.log(`Storage: attempted to delete ${deletePromises.length} images`);
  }

  /**
   * Upload new image files and insert records into the database.
   * Uses the transactional Prisma client for DB consistency.
   */
  private async uploadRoomImages(
    tx: TxClient,
    roomId: string,
    files?: Express.Multer.File[],
  ): Promise<void> {
    if (!files || files.length === 0) return;

    const uploaded = await this.uploadService.uploadImages(files);

    if (uploaded.length > 0) {
      await tx.roomImages.createMany({
        data: uploaded.map((img) => ({
          roomId,
          imageUrl: img.imageUrl,
          imagePublicId: img.imagePublicId,
        })),
      });
      this.logger.log(`Room ${roomId}: uploaded and saved ${uploaded.length} images`);
    }
  }

  /**
   * Replace all amenities for a room.
   * Deletes existing amenities, then inserts the new list.
   * Accepts raw DTO value which can be a JSON string or array.
   */
  private async updateRoomAmenities(
    tx: TxClient,
    roomId: string,
    rawAmenities?: string[] | string,
  ): Promise<void> {
    if (rawAmenities === undefined) return;

    // Parse input — could be a JSON string from FormData
    let amenities: string[] = [];
    if (typeof rawAmenities === 'string') {
      try {
        amenities = JSON.parse(rawAmenities);
      } catch {
        amenities = rawAmenities.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else if (Array.isArray(rawAmenities)) {
      amenities = rawAmenities;
    }

    // Clear existing and insert new (inside the same transaction)
    await tx.roomAmenities.deleteMany({ where: { roomId } });

    if (amenities.length > 0) {
      await tx.roomAmenities.createMany({
        data: amenities.map((name) => ({ roomId, name })),
        skipDuplicates: true,
      });
    }

    this.logger.log(`Room ${roomId}: set ${amenities.length} amenities`);
  }

  /**
   * Fetch a room with all relations (images, amenities).
   * Throws NotFoundException if not found.
   */
  private async findFullRoom(roomId: string): Promise<any> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { images: true, amenities: true },
    });

    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found after update`);
    }

    return room;
  }

  /**
   * Publish a room event to RabbitMQ.
   * Fire-and-forget — errors are logged, never thrown.
   */
  private publishRoomEvent(pattern: string, data: any): void {
    this.rabbitMQService
      .publishMessage(pattern, {
        data,
        timestamp: new Date().toISOString(),
      })
      .catch((err) => {
        this.logger.warn(`Failed to publish ${pattern}: ${err.message}`);
      });
  }

  /**
   * Fetch building info from the building-service.
   */
  private async fetchBuildingFromService(
    buildingId: string,
  ): Promise<BuildingResponse> {
    const baseUrl =
      process.env.BUILDING_SERVICE_URL || 'http://building-service:3002';
    const normalizedBaseUrl = baseUrl.endsWith('/')
      ? baseUrl.slice(0, -1)
      : baseUrl;
    const url = `${normalizedBaseUrl}/buildings/${buildingId}`;

    try {
      const response = await axios.get(url, { timeout: 5000 });
      const payload = response.data?.data ?? response.data;

      if (!payload) {
        throw new NotFoundException('Building not found');
      }

      return payload;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        throw new NotFoundException('Building not found');
      }

      throw new Error(
        `Failed to fetch building info from building-service: ${axiosError.message}`,
      );
    }
  }
}
