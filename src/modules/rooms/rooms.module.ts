import { Module } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { UploadService } from 'src/utils/uploads.service';
import { KafkaService } from 'src/kafka/kafka.service';
@Module({
  imports: [PrismaModule],
  controllers: [RoomsController],
  providers: [RoomsService, PrismaService, UploadService,  KafkaService],
})
export class RoomsModule {}
