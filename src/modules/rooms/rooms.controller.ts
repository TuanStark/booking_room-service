import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UploadedFiles,
  UseInterceptors,
  HttpStatus,
  Query,
  HttpCode,
  HttpException,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { HttpMessage } from 'src/common/global/globalEnum';
import { ResponseData } from 'src/common/global/globalClass';
import { FindAllDto } from 'src/common/global/find-all.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) { }

  @Post()
  @UseInterceptors(FilesInterceptor('files'))
  async create(
    @Body() createRoomDto: CreateRoomDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    console.log(files);
    try {
      const room = await this.roomsService.create(createRoomDto, files);
      return new ResponseData(room, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(
        null,
        HttpStatus.NOT_FOUND,
        HttpMessage.NOT_FOUND,
      );
    }
  }

  @Get()
  async findAll(@Query() query: FindAllDto) {
    try {
      const room = await this.roomsService.findAll(query);
      return new ResponseData(room, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(
        null,
        HttpStatus.INTERNAL_SERVER_ERROR,
        HttpMessage.SERVER_ERROR,
      );
    }
  }

  /**
   * Get room statistics for dashboard
   * GET /rooms/stats
   */
  @Get('stats')
  async getStats() {
    try {
      const stats = await this.roomsService.getStats();
      return new ResponseData(stats, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(
        null,
        HttpStatus.INTERNAL_SERVER_ERROR,
        HttpMessage.SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const room = await this.roomsService.findOne(id);
      return new ResponseData(room, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(
        null,
        HttpStatus.NOT_FOUND,
        HttpMessage.NOT_FOUND,
      );
    }
  }

  @Patch(':id')
  @UseInterceptors(FilesInterceptor('files'))
  async update(
    @Param('id') id: string,
    @Body() updateRoomDto: UpdateRoomDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    try {
      const room = await this.roomsService.update(id, updateRoomDto, files);
      return new ResponseData(room, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      console.error('Update room error in controller:', error);
      return new ResponseData(null, HttpStatus.INTERNAL_SERVER_ERROR, HttpMessage.SERVER_ERROR);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // 204
  async remove(@Param('id') id: string): Promise<void> {
    try {
      await this.roomsService.remove(id);
    } catch (error) {
      throw new HttpException(HttpMessage.SERVER_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('building/:buildingId')
  async getRoombyBuildingId(@Param('buildingId') buildingId: string) {
    try {
      const rooms = await this.roomsService.getRoombyBuildingId(buildingId);
      return new ResponseData(rooms, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(null, HttpStatus.NOT_FOUND, HttpMessage.NOT_FOUND);
    }
  }
}
