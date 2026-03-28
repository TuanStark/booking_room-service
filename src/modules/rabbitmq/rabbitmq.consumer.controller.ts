import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { RoomsService } from '../rooms/rooms.service';
import { RoomStatus } from '../rooms/dto/enum';

@Controller()
export class RabbitMQConsumerController {
    private readonly logger = new Logger(RabbitMQConsumerController.name);

    constructor(private readonly roomsService: RoomsService) { }

    // ═══════════════════════════════════════════════════════════════════════
    // booking.created — Increment room capacity count
    // ═══════════════════════════════════════════════════════════════════════

    @EventPattern('booking.created')
    async handleBookingCreated(
        @Payload() data: any,
        @Ctx() context: RmqContext,
    ) {
        this.logger.log(`Received booking.created event: ${JSON.stringify(data)}`);
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            const { details, isPreBooking } = data;

            if (!details || !Array.isArray(details) || details.length === 0) {
                this.logger.warn('No room details in booking created event');
                channel.ack(originalMsg);
                return;
            }

            // Pre-bookings (QUEUED) don't affect current room capacity
            if (isPreBooking) {
                this.logger.log('Pre-booking received — skipping capacity update');
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

                // Atomic increment to prevent race conditions
                const updatedRoom = await this.roomsService['prisma'].room.update({
                    where: { id: roomId },
                    data: {
                        countCapacity: { increment: 1 }
                    }
                });

                // If capacity reached maximum → mark as BOOKED
                if (updatedRoom.countCapacity >= updatedRoom.capacity) {
                    await this.roomsService.updateRoomStatus(roomId, RoomStatus.BOOKED);
                }

                this.logger.log(`Room ${roomId} capacity increased. Current: ${updatedRoom.countCapacity}/${updatedRoom.capacity}`);
            }

            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`Error processing booking.created: ${error.message}`);
            channel.nack(originalMsg, false, true);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // booking.canceled — Decrement room capacity count
    // ═══════════════════════════════════════════════════════════════════════

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

                if ((room.countCapacity ?? 0) > 0) {
                    const updatedRoom = await this.roomsService['prisma'].room.update({
                        where: { id: roomId },
                        data: {
                            countCapacity: { decrement: 1 }
                        }
                    });

                    if (updatedRoom.countCapacity < updatedRoom.capacity && updatedRoom.status === RoomStatus.BOOKED) {
                        await this.roomsService.updateRoomStatus(roomId, RoomStatus.AVAILABLE);
                    }

                    this.logger.log(`Room ${roomId} capacity returned. Current: ${updatedRoom.countCapacity}/${updatedRoom.capacity}`);
                } else {
                    this.logger.warn(`Room ${roomId} capacity is already 0, skipping decrement.`);
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

    // ═══════════════════════════════════════════════════════════════════════
    // booking.expiring_soon — Mark rooms as upcoming available for pre-booking
    // Room stays BOOKED but other services know it will be available soon.
    // ═══════════════════════════════════════════════════════════════════════

    @EventPattern('booking.expiring_soon')
    async handleBookingExpiringSoon(
        @Payload() data: any,
        @Ctx() context: RmqContext,
    ) {
        this.logger.log(`Received booking.expiring_soon event: ${JSON.stringify(data)}`);
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            const { details, endDate, bookingId } = data;

            if (!details || !Array.isArray(details)) {
                this.logger.warn('No room details in expiring_soon event');
                channel.ack(originalMsg);
                return;
            }

            for (const detail of details) {
                const { roomId } = detail;
                if (!roomId) continue;

                // Log for visibility. Room status stays the same (still occupied).
                // Pre-booking availability is determined by booking-service validation.
                this.logger.log(
                    `Room ${roomId} from booking ${bookingId} is expiring soon (ends: ${endDate}). ` +
                    `Room is now eligible for pre-booking by new tenants.`
                );
            }

            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`Error processing booking.expiring_soon: ${error.message}`);
            channel.nack(originalMsg, false, true);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // booking.completed — Lease ended, release room capacity
    // ═══════════════════════════════════════════════════════════════════════

    @EventPattern('booking.completed')
    async handleBookingCompleted(
        @Payload() data: any,
        @Ctx() context: RmqContext,
    ) {
        this.logger.log(`Received booking.completed event: ${JSON.stringify(data)}`);
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            const { details } = data;

            if (!details || !Array.isArray(details) || details.length === 0) {
                this.logger.warn('No room details in booking completed event');
                channel.ack(originalMsg);
                return;
            }

            for (const roomId of details) {
                if (!roomId) continue;

                const room = await this.roomsService.getRoomById(roomId) as any;
                if (!room) {
                    this.logger.error(`Room ${roomId} not found`);
                    continue;
                }

                if ((room.countCapacity ?? 0) > 0) {
                    const updatedRoom = await this.roomsService['prisma'].room.update({
                        where: { id: roomId },
                        data: {
                            countCapacity: { decrement: 1 }
                        }
                    });

                    // If room now has space → mark as AVAILABLE
                    if (updatedRoom.countCapacity < updatedRoom.capacity && updatedRoom.status === RoomStatus.BOOKED) {
                        await this.roomsService.updateRoomStatus(roomId, RoomStatus.AVAILABLE);
                    }

                    this.logger.log(
                        `Room ${roomId} capacity released (lease completed). Current: ${updatedRoom.countCapacity}/${updatedRoom.capacity}`
                    );
                } else {
                    this.logger.warn(`Room ${roomId} capacity already 0 during completion.`);
                    if (room.status === RoomStatus.BOOKED) {
                        await this.roomsService.updateRoomStatus(roomId, RoomStatus.AVAILABLE);
                    }
                }
            }

            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`Error processing booking.completed: ${error.message}`);
            channel.nack(originalMsg, false, true);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // booking.renewed — Tenant renewed, room remains occupied
    // ═══════════════════════════════════════════════════════════════════════

    @EventPattern('booking.renewed')
    async handleBookingRenewed(
        @Payload() data: any,
        @Ctx() context: RmqContext,
    ) {
        this.logger.log(`Received booking.renewed event: ${JSON.stringify(data)}`);
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            const { bookingId, details, newEndDate, extensionMonths } = data;

            if (!details || !Array.isArray(details)) {
                channel.ack(originalMsg);
                return;
            }

            for (const roomId of details) {
                if (!roomId) continue;
                // Room stays occupied — no capacity change needed
                this.logger.log(
                    `Room ${roomId} lease renewed (booking ${bookingId}). ` +
                    `Extended by ${extensionMonths} months, new end: ${newEndDate}`
                );
            }

            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`Error processing booking.renewed: ${error.message}`);
            channel.nack(originalMsg, false, true);
        }
    }
}
