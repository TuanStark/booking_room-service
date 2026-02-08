import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RabbitMQProducerService } from './rabbitmq.producer.service';
import { RabbitMQConsumerController } from './rabbitmq.consumer.controller';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
    imports: [
        ConfigModule,
        forwardRef(() => RoomsModule),
        ClientsModule.registerAsync([
            {
                name: 'RABBITMQ_SERVICE',
                imports: [ConfigModule],
                useFactory: (configService: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: [
                            configService.get<string>('RABBITMQ_URL') ||
                            'amqp://localhost:5672',
                        ],
                        queue:
                            configService.get<string>('RABBITMQ_QUEUE') || 'room.bookings',
                        queueOptions: { durable: true },
                        noAck: false, // We want to manually ack
                        prefetchCount: 1,
                    },
                }),
                inject: [ConfigService],
            },
        ]),
    ],
    controllers: [RabbitMQConsumerController],
    providers: [RabbitMQProducerService],
    exports: [RabbitMQProducerService],
})
export class RabbitMQModule { }
