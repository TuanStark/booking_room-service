import { Injectable, OnModuleInit } from '@nestjs/common';
import { Kafka, EachMessagePayload } from 'kafkajs';
import { KafkaTopics } from './kafka-topics.enum';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KafkaConsumerService implements OnModuleInit {
  private readonly kafka: Kafka;
  private readonly consumer;

  constructor(private readonly configService: ConfigService) {
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

  //  Logic xử lý khi nhận event
  
  // Booking events
  private async handleBookingCreated(data: any) {
    console.log('📩 [Kafka] Booking created event received:', data);
    //Ví dụ: update phòng -> set room.status = 'OCCUPIED'
  }

  private async handleBookingCanceled(data: any) {
    console.log('📩 [Kafka] Booking canceled event received:', data);
    // Ví dụ: update phòng -> set room.status = 'AVAILABLE'
  }

  // Payment events
  private async handlePaymentSuccess(data: any) {
    console.log('📩 [Kafka] Payment success event received:', data);
    // Ví dụ: confirm booking, update booking status to 'CONFIRMED'
  }

  private async handlePaymentFailed(data: any) {
    console.log('📩 [Kafka] Payment failed event received:', data);
    // Ví dụ: cancel booking, update booking status to 'CANCELLED'
  }

  private async handlePaymentRefunded(data: any) {
    console.log('📩 [Kafka] Payment refunded event received:', data);
    // Ví dụ: update booking status to 'REFUNDED', release room
  }
}
