import { Injectable } from '@nestjs/common';
import {
  deleteImageToService,
  uploadImagesToService,
  uploadImageToService,
} from './http.util';

@Injectable()
export class UploadService {
  async uploadImage(file: Express.Multer.File): Promise<any> {
    return uploadImageToService(file); // Delegate to utility function
  }

  async deleteImage(publicId: string): Promise<string> {
    return deleteImageToService(publicId); // Delegate to utility function
  }

  async uploadImages(files: Express.Multer.File[]): Promise<any> {
    return uploadImagesToService(files); // Delegate to utility function
  }
}
