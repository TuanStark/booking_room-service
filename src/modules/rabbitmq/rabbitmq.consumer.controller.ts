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

                const currentCountCapacity = room.countCapacity ?? 0;

                // Cập nhật status room thành BOOKED và tăng countCapacity
                await this.roomsService.update(roomId, {
                    // status: RoomStatus.BOOKED,
                    countCapacity: currentCountCapacity + 1,
                });

                if (room.countCapacity >= room.capacity) {
                    await this.roomsService.update(roomId, {
                        status: RoomStatus.BOOKED,
                    });
                }

                this.logger.log(`Room ${roomId} status updated to BOOKED`);
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

                if (room.status !== RoomStatus.BOOKED) {
                    this.logger.warn(
                        `Room ${roomId} is not booked (status: ${room.status})`,
                    );
                    continue;
                }

                const currentCountCapacity = room.countCapacity ?? 0;

                // Cập nhật status room thành AVAILABLE và giảm countCapacity
                await this.roomsService.update(roomId, {
                    // status: RoomStatus.AVAILABLE,
                    countCapacity: Math.max(0, currentCountCapacity - 1),
                });

                if (room.countCapacity <= room.capacity) {
                    await this.roomsService.update(roomId, {
                        status: RoomStatus.AVAILABLE,
                    });
                }

                this.logger.log(`Room ${roomId} status updated to AVAILABLE`);
            }

            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`Error processing booking.canceled: ${error.message}`);
            channel.nack(originalMsg, false, true);
        }
    }
}
