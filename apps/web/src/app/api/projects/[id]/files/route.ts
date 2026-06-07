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
    let resolvedFileType = fileType;
    if (!resolvedFileType && filename) {
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      if (ext === 'skp') resolvedFileType = 'model/skp';
      else if (ext === 'blend') resolvedFileType = 'model/blend';
      else if (ext === 'obj') resolvedFileType = 'model/obj';
      else if (ext === 'fbx') resolvedFileType = 'model/fbx';
      else if (ext === 'glb') resolvedFileType = 'model/gltf-binary';
      else resolvedFileType = 'application/octet-stream';
    }

    if (!filename || !key || !resolvedFileType) {
      return NextResponse.json(
        { error: 'Missing required fields: filename, key, and fileType are required' },
        { status: 400 }
      );
    }

    const newFile = await storeFileMetadata(projectId, filename, key, resolvedFileType, metadata || {});

    return NextResponse.json(newFile, { status: 201 });

  } catch (error: any) {
    console.error('[Project Files Registration API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error registering file metadata' },
      { status: 500 }
    );
  }
}
