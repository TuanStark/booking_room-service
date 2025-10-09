import { Injectable, OnModuleInit } from '@nestjs/common';
import { Kafka, EachMessagePayload } from 'kafkajs';
import { KafkaTopics } from './kafka-topics.enum';
import { ConfigService } from '@nestjs/config';
import { RoomsService } from '../rooms/rooms.service';
import { RoomStatus } from '@prisma/client';

@Injectable()
export class KafkaConsumerService implements OnModuleInit {
  private readonly kafka: Kafka;
  private readonly consumer;

  constructor(
    private readonly configService: ConfigService,
    private readonly roomsService: RoomsService,
  ) {
    this.kafka = new Kafka({
      clientId: this.configService.get<string>('KAFKA_CLIENT_ID') || 'room-service',
      brokers: this.configService.get<string>('KAFKA_BROKER')?.split(',') || ['localhost:9092'],
    });

    this.consumer = this.kafka.consumer({ groupId: this.configService.get<string>('KAFKA_GROUP_ID') || 'room-group' });
  }

  async onModuleInit() {
    try {
      await this.consumer.connect();

      //Sub tất cả các topic mà service này quan tâm
      // Booking events
      await this.consumer.subscribe({ topic: KafkaTopics.BOOKING_CREATED });
      await this.consumer.subscribe({ topic: KafkaTopics.BOOKING_CANCELED });
      
      // Payment events
      await this.consumer.subscribe({ topic: KafkaTopics.PAYMENT_SUCCESS });
      await this.consumer.subscribe({ topic: KafkaTopics.PAYMENT_FAILED });
      await this.consumer.subscribe({ topic: KafkaTopics.PAYMENT_REFUNDED });
      
      await this.run();
    } catch (error) {
      console.warn('⚠️ Kafka not available, skipping consumer setup:', error.message);
    }
  }

  private async run() {
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
        const value = message.value?.toString();
        if (!value) return;

        const data = JSON.parse(value);
        switch (topic) {
          // Booking events
          case KafkaTopics.BOOKING_CREATED:
            await this.handleBookingCreated(data);
            break;
          case KafkaTopics.BOOKING_CANCELED:
            await this.handleBookingCanceled(data);
            break;
            
          // Payment events
          case KafkaTopics.PAYMENT_SUCCESS:
            await this.handlePaymentSuccess(data);
            break;
          case KafkaTopics.PAYMENT_FAILED:
            await this.handlePaymentFailed(data);
            break;
          case KafkaTopics.PAYMENT_REFUNDED:
            await this.handlePaymentRefunded(data);
            break;
            
          default:
            console.warn(`Unhandled topic: ${topic}`);
        }
      },
    });
  }

  // Logic xử lý khi nhận event
  
  // Booking events
  private async handleBookingCreated(data: any) {
    console.log('📩 [Kafka] Booking created event received:', data);
    
    try {
      const { roomId, bookingId, userId, startDate, endDate } = data;
      
      if (!roomId) {
        console.warn('⚠️ No roomId in booking created event');
        return;
      }

      // Kiểm tra room có tồn tại không
      const room = await this.roomsService.getRoomById(roomId);
      if (!room) {
        console.error(`❌ Room ${roomId} not found`);
        return;
      }

      // Kiểm tra room có available không
      if (room.status !== RoomStatus.AVAILABLE) {
        console.warn(`⚠️ Room ${roomId} is not available (status: ${room.status})`);
        return;
      }

      // Đổi status room từ AVAILABLE -> BOOKED
      await this.roomsService.updateRoomStatus(roomId, RoomStatus.BOOKED);
      
      console.log(`✅ Room ${roomId} status updated to BOOKED for booking ${bookingId}`);
      
    } catch (error) {
      console.error('❌ Error handling booking created event:', error.message);
    }
  }

  private async handleBookingCanceled(data: any) {
    console.log('📩 [Kafka] Booking canceled event received:', data);
    
    try {
      const { roomId, bookingId, userId, reason } = data;
      
      if (!roomId) {
        console.warn('⚠️ No roomId in booking canceled event');
        return;
      }

      // Kiểm tra room có tồn tại không
      const room = await this.roomsService.getRoomById(roomId);
      if (!room) {
        console.error(`❌ Room ${roomId} not found`);
        return;
      }

      // Kiểm tra room có booked không
      if (room.status !== RoomStatus.BOOKED) {
        console.warn(`⚠️ Room ${roomId} is not booked (status: ${room.status})`);
        return;
      }

      // Đổi status room từ BOOKED -> AVAILABLE
      await this.roomsService.updateRoomStatus(roomId, RoomStatus.AVAILABLE);
      
      console.log(`✅ Room ${roomId} status updated to AVAILABLE after booking ${bookingId} cancellation`);
      
    } catch (error) {
      console.error('❌ Error handling booking canceled event:', error.message);
    }
  }

  // Payment events
  private async handlePaymentSuccess(data: any) {
    console.log('📩 [Kafka] Payment success event received:', data);
    
    try {
      const { paymentId, bookingId, roomId, amount, transactionId } = data;
      
      if (!roomId) {
        console.warn('⚠️ No roomId in payment success event');
        return;
      }

      // Kiểm tra room có tồn tại không
      const room = await this.roomsService.getRoomById(roomId);
      if (!room) {
        console.error(`❌ Room ${roomId} not found`);
        return;
      }

      // Kiểm tra room có booked không (để confirm)
      if (room.status !== RoomStatus.BOOKED) {
        console.warn(`⚠️ Room ${roomId} is not booked (status: ${room.status})`);
        return;
      }

      // Room vẫn giữ status BOOKED (đã được book từ trước)
      // Payment success chỉ confirm booking, không thay đổi room status
      
      console.log(`✅ Payment ${paymentId} confirmed for booking ${bookingId}, room ${roomId} remains BOOKED`);
      
    } catch (error) {
      console.error('❌ Error handling payment success event:', error.message);
    }
  }

  private async handlePaymentFailed(data: any) {
    console.log('📩 [Kafka] Payment failed event received:', data);
    
    try {
      const { paymentId, bookingId, roomId, amount, reason } = data;
      
      if (!roomId) {
        console.warn('⚠️ No roomId in payment failed event');
        return;
      }

      // Kiểm tra room có tồn tại không
      const room = await this.roomsService.getRoomById(roomId);
      if (!room) {
        console.error(`❌ Room ${roomId} not found`);
        return;
      }

      // Kiểm tra room có booked không
      if (room.status !== RoomStatus.BOOKED) {
        console.warn(`⚠️ Room ${roomId} is not booked (status: ${room.status})`);
        return;
      }

      // Payment failed -> release room (BOOKED -> AVAILABLE)
      await this.roomsService.updateRoomStatus(roomId, RoomStatus.AVAILABLE);
      
      console.log(`✅ Room ${roomId} status updated to AVAILABLE after payment ${paymentId} failed`);
      
    } catch (error) {
      console.error('❌ Error handling payment failed event:', error.message);
    }
  }

  private async handlePaymentRefunded(data: any) {
    console.log('📩 [Kafka] Payment refunded event received:', data);
    
    try {
      const { paymentId, bookingId, roomId, amount, refundAmount, reason } = data;
      
      if (!roomId) {
        console.warn('⚠️ No roomId in payment refunded event');
        return;
      }

      // Kiểm tra room có tồn tại không
      const room = await this.roomsService.getRoomById(roomId);
      if (!room) {
        console.error(`❌ Room ${roomId} not found`);
        return;
      }

      // Kiểm tra room có booked không
      if (room.status !== RoomStatus.BOOKED) {
        console.warn(`⚠️ Room ${roomId} is not booked (status: ${room.status})`);
        return;
      }

      // Payment refunded -> release room (BOOKED -> AVAILABLE)
      await this.roomsService.updateRoomStatus(roomId, RoomStatus.AVAILABLE);
      
      console.log(`✅ Room ${roomId} status updated to AVAILABLE after payment ${paymentId} refunded`);
      
    } catch (error) {
      console.error('❌ Error handling payment refunded event:', error.message);
    }
  }
}
