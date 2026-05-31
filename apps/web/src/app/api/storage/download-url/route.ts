import { NextResponse } from 'next/server';
import { createPresignedDownloadUrl } from '../../../../lib/storage';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key || key.trim() === '') {
      return NextResponse.json(
        { error: "Missing required query parameter: 'key'" },
        { status: 400 }
      );
    }

    // Generate the presigned GET URL
    const downloadUrl = await createPresignedDownloadUrl(key);

    return NextResponse.json({
      url: downloadUrl
    }, { status: 200 });

  } catch (error: any) {
    // Prevent internal credential/config leak in the public error response
    console.error('[Download API Error] Failed to generate download URL:', error.message);
    return NextResponse.json(
      { error: 'Internal server error occurred while generating download URL' },
      { status: 500 }
    );
  }
}
