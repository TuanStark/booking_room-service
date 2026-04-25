import { IsArray, IsEnum, IsString, ArrayMinSize } from 'class-validator';
import { RoomStatus } from './enum';

export class BulkUpdateStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[];

  @IsEnum(RoomStatus)
  status: RoomStatus;
}
