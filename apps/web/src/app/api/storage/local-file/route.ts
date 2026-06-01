import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getLocalRootPath(): string {
  return process.env.LOCAL_WORKSPACE_ROOT || path.resolve(process.cwd(), '../../storage');
}

/**
 * GET: Serves the file matching the 'key' search parameter from the local disk cache.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key || key.trim() === '') {
      return NextResponse.json({ error: "Missing query parameter 'key'" }, { status: 400 });
    }

    // Sanitize path to prevent directory traversal outside local root
    const rootPath = getLocalRootPath();
    const resolvedPath = path.normalize(path.join(rootPath, key));

    if (!resolvedPath.startsWith(rootPath)) {
      return NextResponse.json({ error: 'Forbidden: Path traversal detected' }, { status: 403 });
    }

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(resolvedPath);
    
    // Simple mime-type mapping
    let contentType = 'application/octet-stream';
    if (key.endsWith('.png')) contentType = 'image/png';
    else if (key.endsWith('.jpg') || key.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (key.endsWith('.webp')) contentType = 'image/webp';
    else if (key.endsWith('.glb')) contentType = 'model/gltf-binary';
    else if (key.endsWith('.blend')) contentType = 'application/x-blender';

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

  } catch (error: any) {
    console.error('[Local Storage API GET Error]:', error.message);
    return NextResponse.json({ error: 'Internal server error serving local file' }, { status: 500 });
  }
}

/**
 * POST: Receives a raw body stream and writes it to the local workspace cache directory.
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key || key.trim() === '') {
      return NextResponse.json({ error: "Missing query parameter 'key'" }, { status: 400 });
    }

    const rootPath = getLocalRootPath();
    const resolvedPath = path.normalize(path.join(rootPath, key));

    if (!resolvedPath.startsWith(rootPath)) {
      return NextResponse.json({ error: 'Forbidden: Path traversal detected' }, { status: 403 });
    }

    // Ensure parent folders are created
    const parentDir = path.dirname(resolvedPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Read payload array buffer and write synchronously to disk
    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    fs.writeFileSync(resolvedPath, buffer);

    return NextResponse.json({ message: 'File written successfully' }, { status: 200 });

  } catch (error: any) {
    console.error('[Local Storage API POST Error]:', error.message);
    return NextResponse.json({ error: 'Internal server error writing local file' }, { status: 500 });
  }
}

/**
 * DELETE: Removes the file from the local cache.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key || key.trim() === '') {
      return NextResponse.json({ error: "Missing query parameter 'key'" }, { status: 400 });
    }

    const rootPath = getLocalRootPath();
    const resolvedPath = path.normalize(path.join(rootPath, key));

    if (!resolvedPath.startsWith(rootPath)) {
      return NextResponse.json({ error: 'Forbidden: Path traversal detected' }, { status: 403 });
    }

    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
      return NextResponse.json({ message: 'File deleted successfully' }, { status: 200 });
    }

    return NextResponse.json({ error: 'File not found' }, { status: 404 });

  } catch (error: any) {
    console.error('[Local Storage API DELETE Error]:', error.message);
    return NextResponse.json({ error: 'Internal server error deleting local file' }, { status: 500 });
  }
}
