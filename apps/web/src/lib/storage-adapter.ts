import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import fs from 'fs';
import path from 'path';

export interface StorageAdapter {
  createUploadTarget(key: string, contentType: string): Promise<{ url: string; method: string }>;
  getDownloadUrl(key: string): Promise<string>;
  deleteFile(key: string): Promise<void>;
}

export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = env.AWS_S3_BUCKET;
  }

  async createUploadTarget(key: string, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: 600 });
    return { url, method: 'PUT' };
  }

  async getDownloadUrl(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return await getSignedUrl(this.client, command, { expiresIn: 900 });
  }

  async deleteFile(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private localDir: string;
  private publicBaseUrl: string;

  constructor() {
    // Fallback to workspace storage root if env is missing
    this.localDir = process.env.LOCAL_WORKSPACE_ROOT || path.resolve(process.cwd(), '../../storage');
    this.publicBaseUrl = env.STORAGE_PUBLIC_BASE_URL || 'http://localhost:3000/api/storage/local-file';
  }

  async createUploadTarget(key: string, contentType: string) {
    const url = `${this.publicBaseUrl}?key=${encodeURIComponent(key)}`;
    return { url, method: 'POST' };
  }

  async getDownloadUrl(key: string) {
    return `${this.publicBaseUrl}?key=${encodeURIComponent(key)}`;
  }

  async deleteFile(key: string) {
    const filePath = path.join(this.localDir, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export function getStorageAdapter(): StorageAdapter {
  if (env.STORAGE_PROVIDER === 's3' || env.STORAGE_PROVIDER === 'cloudflare_r2') {
    return new S3StorageAdapter();
  }
  return new LocalStorageAdapter();
}
