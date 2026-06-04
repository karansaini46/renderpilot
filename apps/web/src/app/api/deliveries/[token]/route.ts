import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';
import { getStorageAdapter } from '../../../../lib/storage-adapter';

export const dynamic = 'force-dynamic';

/**
 * GET: Retrieves the details of a client delivery sharing space.
 * Enforces optional password security gate.
 * Resolves pre-signed cloud storage URLs for the client to view renders.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(request.url);
    const queryPassword = searchParams.get('password');
    const headerPassword = request.headers.get('x-delivery-password');
    const passwordAttempt = queryPassword || headerPassword;

    // Find the delivery configuration
    const delivery = await prisma.delivery.findUnique({
      where: { token },
      include: {
        project: {
          select: {
            name: true,
            clientName: true
          }
        }
      }
    });

    if (!delivery) {
      return NextResponse.json({ error: 'Delivery link not found' }, { status: 404 });
    }

    // Verify password if one is configured
    if (delivery.password && delivery.password.trim() !== '') {
      if (!passwordAttempt || passwordAttempt.trim() !== delivery.password.trim()) {
        return NextResponse.json(
          { error: 'Unauthorized: Password required or incorrect', passwordRequired: true },
          { status: 401 }
        );
      }
    }

    // Parse the included render IDs
    let renderIds: string[] = [];
    try {
      renderIds = JSON.parse(delivery.rendersJson || '[]');
    } catch {
      renderIds = [];
    }

    // Fetch the renders
    const renders = await prisma.render.findMany({
      where: {
        id: { in: renderIds }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Resolve pre-signed URLs from the storage adapter
    const adapter = getStorageAdapter();
    const resolvedRenders = await Promise.all(
      renders.map(async (r) => {
        let finalUrl = null;
        let previewUrl = null;

        const finalKey = r.finalUrl || r.finalImageUrl;
        if (finalKey) {
          try {
            finalUrl = await adapter.getDownloadUrl(finalKey);
          } catch (err: any) {
            console.error(`Failed to sign finalUrl key ${finalKey}:`, err.message);
          }
        }

        const previewKey = r.previewUrl || r.finalImageUrl;
        if (previewKey) {
          try {
            previewUrl = await adapter.getDownloadUrl(previewKey);
          } catch (err: any) {
            console.error(`Failed to sign previewUrl key ${previewKey}:`, err.message);
          }
        }

        return {
          id: r.id,
          seed: r.seed ? r.seed.toString() : null, // Safely convert BigInt
          styleId: r.styleId,
          createdAt: r.createdAt,
          finalUrl,
          previewUrl
        };
      })
    );

    // Fetch comments left on this delivery
    const comments = await prisma.deliveryComment.findMany({
      where: { deliveryId: delivery.id },
      orderBy: { createdAt: 'asc' }
    });

    return NextResponse.json({
      id: delivery.id,
      token: delivery.token,
      commentsEnabled: delivery.commentsEnabled,
      createdAt: delivery.createdAt,
      projectName: delivery.project.name,
      clientName: delivery.project.clientName,
      renders: resolvedRenders,
      comments
    }, { status: 200 });

  } catch (error: any) {
    console.error('[Delivery GET API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error retrieving client delivery' },
      { status: 500 }
    );
  }
}

/**
 * POST: Authenticates password gate for a delivery token.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { password } = body;

    const delivery = await prisma.delivery.findUnique({
      where: { token }
    });

    if (!delivery) {
      return NextResponse.json({ error: 'Delivery link not found' }, { status: 404 });
    }

    if (delivery.password && delivery.password.trim() !== '') {
      if (!password || password.trim() !== delivery.password.trim()) {
        return NextResponse.json(
          { error: 'Incorrect password', authenticated: false },
          { status: 401 }
        );
      }
    }

    return NextResponse.json({ success: true, authenticated: true }, { status: 200 });
  } catch (error: any) {
    console.error('[Delivery Authenticate API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error authenticating delivery space' },
      { status: 500 }
    );
  }
}
