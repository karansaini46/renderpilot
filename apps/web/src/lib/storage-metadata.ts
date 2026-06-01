import { prisma } from './db';

/**
 * Persists file metadata record in the Neon database.
 * No binary files are stored in the database; only URL locations and S3 object keys.
 */
export async function storeFileMetadata(
  projectId: string,
  filename: string,
  key: string,
  fileType: string,
  metadata: Record<string, any> = {}
) {
  const fileId = `file_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  return await prisma.projectFile.create({
    data: {
      id: fileId,
      projectId,
      fileUrl: key, // Store the storage path key or URL location
      fileType,
      metadataJson: JSON.stringify(metadata),
    },
  });
}

/**
 * Retrieves the project file metadata collection for a project.
 */
export async function getProjectFiles(projectId: string) {
  return await prisma.projectFile.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
}
