import { Injectable } from '@nestjs/common';
import {
  deleteImageToService,
  uploadImagesToService,
  uploadImageToService,
} from './http.util';

/** Standardized return type from the upload service */
export interface UploadResult {
  imageUrl: string;
  imagePublicId: string;
}

@Injectable()
export class UploadService {
  /** Upload a single image file. Returns the URL and public ID. */
  async uploadImage(file: Express.Multer.File): Promise<UploadResult> {
    return uploadImageToService(file);
  }

  /** Upload multiple image files in one batch call. */
  async uploadImages(files: Express.Multer.File[]): Promise<UploadResult[]> {
    return uploadImagesToService(files);
  }

  /**
   * Delete an image from storage by its public ID.
   * Returns silently if the image is already gone (idempotent).
   */
  async deleteImage(publicId: string): Promise<string> {
    return deleteImageToService(publicId);
  }
}
