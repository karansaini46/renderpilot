import { NextResponse } from 'next/server';
import { storeFileMetadata } from '../../../../../lib/storage-metadata';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { filename, key, fileType, metadata } = body;

    if (!filename || !key || !fileType) {
      return NextResponse.json(
        { error: 'Missing required fields: filename, key, and fileType are required' },
        { status: 400 }
      );
    }

    const newFile = await storeFileMetadata(projectId, filename, key, fileType, metadata || {});

    return NextResponse.json(newFile, { status: 201 });

  } catch (error: any) {
    console.error('[Project Files Registration API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error registering file metadata' },
      { status: 500 }
    );
  }
}
