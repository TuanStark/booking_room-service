import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { RoomsService } from '../rooms/rooms.service';
import { RoomStatus } from '../rooms/dto/enum';

@Controller()
export class RabbitMQConsumerController {
    private readonly logger = new Logger(RabbitMQConsumerController.name);

    constructor(private readonly roomsService: RoomsService) { }

    @EventPattern('booking.created')
    async handleBookingCreated(
        @Payload() data: any,
        @Ctx() context: RmqContext,
    ) {
        this.logger.log(`Received booking.created event: ${JSON.stringify(data)}`);
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            const { details } = data;

            if (!details || !Array.isArray(details) || details.length === 0) {
                this.logger.warn('No room details in booking created event');
                channel.ack(originalMsg);
                return;
            }

            for (const detail of details) {
                const { roomId } = detail;
                if (!roomId) continue;

                const room = await this.roomsService.getRoomById(roomId) as any;
                if (!room) {
                    this.logger.error(`Room ${roomId} not found`);
                    continue;
                }

                if (room.status !== RoomStatus.AVAILABLE) {
                    this.logger.warn(
                        `Room ${roomId} is not available (status: ${room.status})`,
                    );
                    continue;
                }

                // Cập nhật countCapacity using Prisma Atomic Increment to prevent Race Conditions
                const updatedRoom = await this.roomsService['prisma'].room.update({
                    where: { id: roomId },
                    data: {
                        countCapacity: { increment: 1 }
                    }
                });

                // Nếu số lượng người đã đạt sức chứa tối đa -> Đổi status thành BOOKED
                if (updatedRoom.countCapacity >= updatedRoom.capacity) {
                    await this.roomsService.updateRoomStatus(roomId, RoomStatus.BOOKED);
                }

                this.logger.log(`Room ${roomId} capacity increased. Current capacity count: ${updatedRoom.countCapacity}/${updatedRoom.capacity}`);
            }

            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`Error processing booking.created: ${error.message}`);
            // Re-queue message if error occurs
            channel.nack(originalMsg, false, true);
        }
    }

    @EventPattern('booking.canceled')
    async handleBookingCanceled(
        @Payload() data: any,
        @Ctx() context: RmqContext,
    ) {
        this.logger.log(`Received booking.canceled event: ${JSON.stringify(data)}`);
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            const { details } = data;

            if (!details || !Array.isArray(details) || details.length === 0) {
                this.logger.warn('No room details in booking canceled event');
                channel.ack(originalMsg);
                return;
            }

            for (const detail of details) {
                const { roomId } = detail;
                if (!roomId) continue;

                const room = await this.roomsService.getRoomById(roomId) as any;
                if (!room) {
                    this.logger.error(`Room ${roomId} not found`);
                    continue;
                }

                // Cập nhật countCapacity using Prisma Atomic Decrement
                // Only decrement if greater than 0
                if ((room.countCapacity ?? 0) > 0) {
                    const updatedRoom = await this.roomsService['prisma'].room.update({
                        where: { id: roomId },
                        data: {
                            countCapacity: { decrement: 1 }
                        }
                    });

                    // Nếu phòng bị hủy, chắc chắn phòng sẽ còn chỗ trống, đổi lại thành AVAILABLE
                    if (updatedRoom.countCapacity < updatedRoom.capacity && updatedRoom.status === RoomStatus.BOOKED) {
                        await this.roomsService.updateRoomStatus(roomId, RoomStatus.AVAILABLE);
                    }

                    this.logger.log(`Room ${roomId} capacity returned. Current capacity count: ${updatedRoom.countCapacity}/${updatedRoom.capacity}`);
                } else {
                    this.logger.warn(`Room ${roomId} capacity is already 0, skipping decrement.`);
                    // Ensure the status is AVAILABLE just in case
                    if (room.status === RoomStatus.BOOKED) {
                        await this.roomsService.updateRoomStatus(roomId, RoomStatus.AVAILABLE);
                    }
                }
            }

            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`Error processing booking.canceled: ${error.message}`);
            channel.nack(originalMsg, false, true);
        }
    }
}
