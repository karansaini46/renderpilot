import { NextResponse } from 'next/server';
import { buildProjectS3Key } from '../../../../lib/storage';
import { getStorageAdapter } from '../../../../lib/storage-adapter';

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { projectId, folder, filename, contentType, userId } = body;
    const resolvedContentType = contentType || 'application/octet-stream';

    // Validate presence of required properties
    if (!projectId || !folder || !filename) {
      return NextResponse.json(
        { error: 'Missing required parameters: projectId, folder, and filename are required' },
        { status: 400 }
      );
    }

    // Default to a fallback user ID if not authenticated or passed
    const activeUserId = userId || 'default-user';

    // Generate S3 key and perform validations internally
    let key: string;
    try {
      key = buildProjectS3Key(activeUserId, projectId, folder, filename);
    } catch (validationError: any) {
      return NextResponse.json(
        { error: validationError.message },
        { status: 400 }
      );
    }

    // Generate target using the dynamic adapter
    const adapter = getStorageAdapter();
    const target = await adapter.createUploadTarget(key, resolvedContentType);

    return NextResponse.json({
      url: target.url,
      method: target.method,
      key: key
    }, { status: 200 });

  } catch (error: any) {
    // Return a generic error message to the client, preventing leak of S3 internal details/credentials
    console.error('[Upload API Error] Failed to generate upload target:', error.message);
    return NextResponse.json(
      { error: 'Internal server error occurred while generating upload target' },
      { status: 500 }
    );
  }
}
