import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQProducerService } from './rabbitmq.producer.service';
import { RabbitMQConsumerController } from './rabbitmq.consumer.controller';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
    imports: [
        ConfigModule,
        forwardRef(() => RoomsModule),
    ],
    controllers: [RabbitMQConsumerController],
    providers: [RabbitMQProducerService],
    exports: [RabbitMQProducerService],
})
export class RabbitMQModule { }
