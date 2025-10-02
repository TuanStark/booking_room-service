import { Type, Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsArray } from 'class-validator';

export class CreateRoomDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    buildingId: string;

    @IsNumber()
    @Type(() => Number)
    @IsNotEmpty()
    price: number;

    @IsNumber()
    @IsNotEmpty()
    @Type(() => Number)
    capacity: number;

    @IsArray()
    @IsOptional()
    imageUrls?: string[]; // danh sách ảnh upload (link url)

    @IsArray()
    @IsOptional()
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch {
                return value.split(',').map(item => item.trim());
            }
        }
        return value;
    })
    amenities?: string[];
}
