import FormData from 'form-data'; // Use default import
import axios from 'axios';

export async function uploadImageToService(file: Express.Multer.File): Promise<any> {
    const formData = new FormData(); // Now works with default import
    formData.append('file', file.buffer, file.originalname);

    try {
        const res = await axios.post(`${process.env.UPLOAD_SERVICE_URL}/upload`, formData, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${formData.getBoundary()}`,
            },
        });
        // Chuẩn hoá key theo BuildingService (imageUrl, imagePublicId)
        return {
            imageUrl: res.data.secure_url || res.data.url,
            imagePublicId: res.data.public_id,
        };
    } catch (error) {
        throw new Error(`Failed to upload image: ${error.message}`);
    }
}

export async function deleteImageToService(publicId: string): Promise<string> {
    try {
        const res = await axios.delete(`${process.env.UPLOAD_SERVICE_URL}/upload`);
        return res.data.message;
    } catch (error) {
        throw new Error(`Failed to upload image: ${error.message}`);
    }
}
