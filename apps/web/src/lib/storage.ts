import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

let s3Client: S3Client | null = null;

/**
 * Initializes and returns the memoized AWS S3 Client.
 */
export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

export const ALLOWED_FOLDERS = ['inputs', 'outputs', 'approved', 'training', 'exports', 'previews'] as const;
export const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'glb', 'obj', 'fbx', 'blend', 'zip'] as const;

/**
 * Validates whether the folder name is safe and allowed.
 */
export function validateFolder(folder: string): boolean {
  return ALLOWED_FOLDERS.includes(folder as any);
}

/**
 * Validates whether the filename has an allowed extension.
 */
export function validateExtension(filename: string): boolean {
  const parts = filename.split('.');
  if (parts.length < 2) return false;
  const ext = parts.pop()?.toLowerCase();
  return ext ? ALLOWED_EXTENSIONS.includes(ext as any) : false;
}

/**
 * Builds the canonical S3 object key for a project file.
 */
export function buildProjectS3Key(userId: string, projectId: string, folder: string, filename: string): string {
  if (!validateFolder(folder)) {
    throw new Error(`Invalid storage folder: ${folder}`);
  }
  if (!validateExtension(filename)) {
    throw new Error(`Invalid file type/extension for file: ${filename}`);
  }

  // Split stem and extension to sanitize them separately and prevent directory traversal
  const parts = filename.split('.');
  const ext = parts.pop()?.toLowerCase();
  const stem = parts.join('.');
  
  const cleanStem = stem.replace(/[^a-zA-Z0-9\-_]/g, '_');
  const cleanFilename = `${cleanStem}.${ext}`;
  
  return `users/${userId}/projects/${projectId}/${folder}/${cleanFilename}`;
}

/**
 * Creates a presigned upload URL (PUT) valid for 10 minutes (600 seconds).
 */
export async function createPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  try {
    return await getSignedUrl(client, command, { expiresIn: 600 });
  } catch (error: any) {
    throw new Error(`Failed to generate presigned upload URL: ${error.message}`);
  }
}

/**
 * Creates a presigned download URL (GET) valid for 15 minutes (900 seconds).
 */
export async function createPresignedDownloadUrl(key: string): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
  });

  try {
    return await getSignedUrl(client, command, { expiresIn: 900 });
  } catch (error: any) {
    throw new Error(`Failed to generate presigned download URL: ${error.message}`);
  }
}

/**
 * Deletes an object from the S3 bucket.
 */
export async function deleteObject(key: string): Promise<void> {
  const client = getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
  });

  try {
    await client.send(command);
  } catch (error: any) {
    throw new Error(`Failed to delete object from S3: ${error.message}`);
  }
}
