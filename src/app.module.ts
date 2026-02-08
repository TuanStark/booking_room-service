import { Module } from '@nestjs/common';
import { RoomsModule } from './modules/rooms/rooms.module';
import { RabbitMQModule } from './modules/rabbitmq/rabbitmq.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    RoomsModule,
    RabbitMQModule,
  ],
  controllers: [],
  providers: [PrismaService],
  exports: [RabbitMQModule],
})
export class AppModule { }
