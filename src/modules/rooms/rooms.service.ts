import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { UploadService } from 'src/utils/uploads.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindAllDto } from 'src/common/global/find-all.dto';
import { RoomStatus } from '@prisma/client';
import { KafkaProducerService } from '../kafka/kafka.producer.service';

@Injectable()
export class RoomsService {
  constructor(
    private readonly uploadService: UploadService,
    private readonly prisma: PrismaService,
    private readonly kafkaService: KafkaProducerService,
  ) { }

  async create(createRoomDto: CreateRoomDto, files: Express.Multer.File[]) {
    console.log('1. Starting room creation...');
    console.log(createRoomDto);

    // Step 1: Create Room
    let room;
    try {
      room = await this.prisma.room.create({
        data: {
          name: createRoomDto.name,
          buildingId: createRoomDto.buildingId,
          price: parseFloat(createRoomDto.price.toString()),
          capacity: parseInt(createRoomDto.capacity.toString()),
          status: 'AVAILABLE',
        },
      });
      console.log('3. Room created:', room.id);
    } catch (dbError) {
      console.log('Database error:', dbError.message);
      throw dbError;
    }

    // Step 2: Upload images
    if (files && files.length > 0) {
      try {
        const images = await this.uploadService.uploadImages(files);

        await this.prisma.roomImages.createMany({
          data: images.map(img => ({
            roomId: room.id,
            imageUrl: img.imageUrl,
            imagePublicId: img.imagePublicId,
          })),
        });

        console.log(`6. ${images.length} images linked to room`);
      } catch (err) {
        console.error('Image upload failed:', err.message);
        throw new Error(`Failed to upload images: ${err.message}`);
      }
    }

    // Step 3: Add amenities
    console.log('7. Adding amenities...');
    console.log("amenities", createRoomDto.amenities);
    if (createRoomDto.amenities) {
      try {
        // Parse amenities if it's a string
        let amenitiesArray = createRoomDto.amenities;
        if (typeof amenitiesArray === 'string') {
          amenitiesArray = JSON.parse(amenitiesArray);
        }

        console.log('8. Creating amenities...');
        console.log(amenitiesArray);
        await this.prisma.roomAmenities.createMany({
          data: amenitiesArray.map((a) => ({
            roomId: room.id,
            name: a,
          })),
          skipDuplicates: true,
        });
        console.log(`9. Amenities added: ${amenitiesArray.length}`);
      } catch (err) {
        console.error('Amenity insert failed:', err.message);
      }
    }
    console.log('10. Room created successfully:', room.id);

    // 4. Fetch full room data
    const fullRoom = await this.prisma.room.findUnique({
      where: { id: room.id },
      include: { images: true, amenities: true },
    });

    // 5. Publish event to Kafka
    await this.kafkaService.emitRoomCreatedEvent({
      data: fullRoom,
      timestamp: new Date().toISOString(),
    });

    return fullRoom;
  }


  async findAll(query: FindAllDto) {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
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
        ]
      }
      : {};
    const orderBy = {
      [sortBy]: sortOrder
    };

    const [rooms, total] = await Promise.all([
      this.prisma.room.findMany({
        where: where,
        orderBy: orderBy,
        skip,
        take,
        include: {
          images: true,
          amenities: true,
        },
      }),
      this.prisma.room.count({
        where: where,
      })
    ])

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
    return room;
  }

  async update(id: string, updateRoomDto: UpdateRoomDto, files?: Express.Multer.File[]) {
    // 1. Update cơ bản
    let room = await this.prisma.room.update({
      where: { id },
      data: {
        name: updateRoomDto.name,
        price: updateRoomDto.price,
        capacity: updateRoomDto.capacity,
        countCapacity: updateRoomDto.countCapacity,
        status: RoomStatus.AVAILABLE,
      },
    });

    // 2. Xử lý ảnh bị xoá (nếu có)
    if (updateRoomDto.imageUrls?.length) {
      const imagesToDelete = await this.prisma.roomImages.findMany({
        where: { id: { in: updateRoomDto.imageUrls } },
      });

      // Xoá bên Cloudinary
      for (const img of imagesToDelete) {
        if (img.imagePublicId) {
          await this.uploadService.deleteImage(img.imagePublicId);
        }
      }

      // Xoá trong DB
      await this.prisma.roomImages.deleteMany({
        where: { id: { in: updateRoomDto.imageUrls } },
      });
    }

    // 3. Upload ảnh mới (nếu có)
    if (files?.length) {
      const newImages = await this.uploadService.uploadImages(files);
      await this.prisma.roomImages.createMany({
        data: newImages.map(img => ({
          roomId: room.id,
          imageUrl: img.imageUrl,
          imagePublicId: img.imagePublicId,
        })),
      });
    }

    // 4. Update amenities
    if (updateRoomDto.amenities) {
      // Xoá hết amenities cũ
      await this.prisma.roomAmenities.deleteMany({
        where: { roomId: room.id },
      });

      // Tạo lại
      await this.prisma.roomAmenities.createMany({
        data: updateRoomDto.amenities.map(a => ({
          roomId: room.id,
          name: a,
        })),
      });
    }

    // 5. Fetch lại room đầy đủ
    const fullRoom = await this.prisma.room.findUnique({
      where: { id: room.id },
      include: { images: true, amenities: true },
    });

    // 6. Publish event Kafka
    await this.kafkaService.emitRoomUpdatedEvent({
      data: fullRoom,
      timestamp: new Date().toISOString(),
    });

    return fullRoom;
  }


  async remove(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    const deletedRoom = await this.prisma.room.delete({
      where: { id },
      include: { images: true, amenities: true },
    });

    await this.kafkaService.emitRoomDeletedEvent({
      data: deletedRoom,
      timestamp: new Date().toISOString(),
    });

    return deletedRoom;
  }

  // Methods for Kafka event handling
  async updateRoomStatus(roomId: string, status: RoomStatus) {
    try {
      const room = await this.prisma.room.update({
        where: { id: roomId },
        data: { status },
      });
      
      console.log(`Room ${roomId} status updated to ${status}`);
      return room;
    } catch (error) {
      console.error(`Failed to update room ${roomId} status:`, error.message);
      throw error;
    }
  }

  async getRoomById(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        images: true,
        amenities: true,
      },
    });
  }

  async getAvailableRooms(buildingId?: string) {
    const where = {
      status: RoomStatus.AVAILABLE,
      ...(buildingId && { buildingId }),
    };

    return this.prisma.room.findMany({
      where,
      include: {
        images: true,
        amenities: true,
      },
    });
  }

  async getBookedRooms(buildingId?: string) {
    const where = {
      status: RoomStatus.BOOKED,
      ...(buildingId && { buildingId }),
    };

    return this.prisma.room.findMany({
      where,
      include: {
        images: true,
        amenities: true,
      },
    });
  }
}
