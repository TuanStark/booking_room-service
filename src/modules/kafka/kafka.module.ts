import { Module, forwardRef } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { KafkaProducerService } from './kafka.producer.service';
import { KafkaConsumerService } from './kafka.consumer.service';
import { ConfigService } from '@nestjs/config';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [
    forwardRef(() => RoomsModule),
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
        useFactory: (configService: ConfigService) => {
          const kafkaBroker = configService.get<string>('KAFKA_BROKER');
          const brokers = kafkaBroker?.split(',') || ['booking_kafka:9092'];
          console.log('KAFKA_BROKER from env:', process.env.KAFKA_BROKER);
          console.log('KAFKA_BROKER from config:', kafkaBroker);
          console.log('Kafka brokers:', brokers);
          return {
            transport: Transport.KAFKA,
            options: {
              client: {
                clientId:
                  configService.get<string>('KAFKA_CLIENT_ID') || 'room-service',
                brokers: brokers,
                retry: {
                  retries: 5,
                },
              },
              consumer: {
                groupId: 'room-consumer',
              },
              run: {
                autoCommit: false,
              },
            },
          };
        },
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [KafkaProducerService, KafkaConsumerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
