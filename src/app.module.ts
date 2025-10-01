import { Module } from '@nestjs/common';
import { RoomsModule } from './modules/rooms/rooms.module';
import { KafkaService } from './kafka/kafka.service';
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
  ],
  controllers: [],
  providers: [PrismaService, KafkaService],
  exports: [KafkaService], // export nếu service khác cần
})
export class AppModule {}
