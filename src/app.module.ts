import { Module } from '@nestjs/common';
import { RoomsModule } from './modules/rooms/rooms.module';
import { KafkaModule } from './modules/kafka/kafka.module';
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
    KafkaModule,
  ],
  controllers: [],
  providers: [PrismaService],
  exports: [KafkaModule], // export nếu service khác cần
})
export class AppModule {}
