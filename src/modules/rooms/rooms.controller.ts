import { Controller, Get, Post, Body, Patch, Param, Delete, UploadedFiles, UseInterceptors, HttpStatus, Query } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { HttpMessage } from 'src/common/global/globalEnum';
import { ResponseData } from 'src/common/global/globalClass';
import { FindAllDto } from 'src/common/global/find-all.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files'))
  async create(@Body() createRoomDto: CreateRoomDto, @UploadedFiles() files: Express.Multer.File[]) {
    console.log(files);
    try {
      const room = await this.roomsService.create(createRoomDto, files);
      return new ResponseData(room, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(null, HttpStatus.NOT_FOUND, HttpMessage.NOT_FOUND);
    }
  }

  @Get()
  async findAll(@Query() query: FindAllDto) {
    try {
      const room = await this.roomsService.findAll(query);
      return new ResponseData(room, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(null, HttpStatus.INTERNAL_SERVER_ERROR, HttpMessage.SERVER_ERROR);
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const room = await this.roomsService.findOne(id);
      return new ResponseData(room, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(null, HttpStatus.NOT_FOUND, HttpMessage.NOT_FOUND);
    }
  }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateRoomDto: UpdateRoomDto) {
  //   try {
  //     const room = await this.roomsService.update(id, updateRoomDto);
  //     return new ResponseData(room, HttpStatus.OK, HttpMessage.SUCCESS);
  //   } catch (error) {
  //     return new ResponseData(null, HttpStatus.NOT_FOUND, HttpMessage.NOT_FOUND);
  //   }
  // }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      const room = await this.roomsService.remove(id);
      return new ResponseData(room, HttpStatus.OK, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(null, HttpStatus.NOT_FOUND, HttpMessage.NOT_FOUND);
    }
  }
}
