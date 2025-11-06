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
      // await this.consumer.subscribe({ topic: KafkaTopics.BOOKING_SUCCESS });
      
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
      const { bookingId, userId, startDate, endDate, details } = data;
      
      if (!details || !Array.isArray(details) || details.length === 0) {
        console.warn('⚠️ No room details in booking created event');
        return;
      }

      // Process each room in the booking
      for (const detail of details) {
        const { roomId, price, time } = detail;
        
        if (!roomId) {
          console.warn('⚠️ No roomId in booking detail');
          continue;
        }

        // Kiểm tra room có tồn tại không
        const room = await this.roomsService.getRoomById(roomId);
        if (!room) {
          console.error(`❌ Room ${roomId} not found`);
          continue;
        }

        // Kiểm tra room có available không
        if (room.status !== RoomStatus.AVAILABLE) {
          console.warn(`⚠️ Room ${roomId} is not available (status: ${room.status})`);
          continue;
        }

        
        if(room.countCapacity >= room.capacity) {
          await this.roomsService.update(roomId, { 
            status: RoomStatus.BOOKED, 
          });
          console.log(`✅ Room ${roomId} status updated to BOOKED for booking ${bookingId}`);
          continue;
        }

        // Đổi status room từ AVAILABLE -> BOOKED và tăng countCapacity
        await this.roomsService.update(roomId, { 
          status: RoomStatus.BOOKED, 
          countCapacity: room.countCapacity + 1 
        });
        console.log(`✅ Room ${roomId} status updated to BOOKED for booking ${bookingId}`);
      }
      
    } catch (error) {
      console.error('❌ Error handling booking created event:', error.message);
    }
  }

  private async handleBookingCanceled(data: any) {
    console.log('📩 [Kafka] Booking canceled event received:', data);
    
    try {
      const { bookingId, userId, reason, details } = data;
      
      if (!details || !Array.isArray(details) || details.length === 0) {
        console.warn('⚠️ No room details in booking canceled event');
        return;
      }

      // Process each room in the booking
      for (const detail of details) {
        const { roomId, price, time } = detail;
        
        if (!roomId) {
          console.warn('⚠️ No roomId in booking detail');
          continue;
        }

        // Kiểm tra room có tồn tại không
        const room = await this.roomsService.getRoomById(roomId);
        if (!room) {
          console.error(`❌ Room ${roomId} not found`);
          continue;
        }

        // Kiểm tra room có booked không
        if (room.status !== RoomStatus.BOOKED) {
          console.warn(`⚠️ Room ${roomId} is not booked (status: ${room.status})`);
          continue;
        }

        if(room.countCapacity >= room.capacity) {
          throw new Error(`⚠️ Room ${roomId} has reached capacity (countCapacity: ${room.countCapacity}, capacity: ${room.capacity})`);
        }

        // Đổi status room từ BOOKED -> AVAILABLE
        await this.roomsService.update(roomId, { 
          status: RoomStatus.AVAILABLE, 
          countCapacity: room.countCapacity + 1 
        });
        
        console.log(`✅ Room ${roomId} status updated to AVAILABLE after booking ${bookingId} cancellation`);
      }
      
    } catch (error) {
      console.error('❌ Error handling booking canceled event:', error.message);
    }
  }

}
