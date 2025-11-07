import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { KafkaTopics } from './kafka-topics.enum';

@Injectable()
export class KafkaProducerService implements OnModuleInit {
  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    try {
      Object.values(KafkaTopics).forEach((topic) =>
        this.kafkaClient.subscribeToResponseOf(topic),
      );
      await this.kafkaClient.connect();
    } catch (error) {
      console.warn(
        '⚠️ Kafka not available, skipping producer setup:',
        error.message,
      );
    }
  }

  async emitRoomCreatedEvent(payload: any) {
    await this.kafkaClient.emit(KafkaTopics.ROOM_CREATED, payload);
  }

  async emitRoomUpdatedEvent(payload: any) {
    await this.kafkaClient.emit(KafkaTopics.ROOM_UPDATED, payload);
  }

  async emitRoomDeletedEvent(payload: any) {
    await this.kafkaClient.emit(KafkaTopics.ROOM_DELETED, payload);
  }
}
