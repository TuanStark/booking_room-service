import { Injectable } from '@nestjs/common';
import { deleteImageToService, uploadImageToService } from '../utils/http.util';

@Injectable()
export class UploadService {
  async uploadImage(file: Express.Multer.File): Promise<any> {
    return uploadImageToService(file); // Delegate to utility function
  }

  async deleteImage(publicId: string): Promise<string> {
    return deleteImageToService(publicId); // Delegate to utility function
  }
}