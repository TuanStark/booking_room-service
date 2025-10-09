import { Module } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { UploadService } from 'src/utils/uploads.service';
import { KafkaModule } from '../kafka/kafka.module';
@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [RoomsController],
  providers: [RoomsService, PrismaService, UploadService,],
  exports: [RoomsService],
})
export class RoomsModule {}
