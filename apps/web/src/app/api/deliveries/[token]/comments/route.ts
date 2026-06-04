import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST: Persists a feedback comment left by the client on a delivery workspace.
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

    const { author, text, renderId } = body;

    if (!author || author.trim() === '') {
      return NextResponse.json(
        { error: 'Author name is required to post a comment' },
        { status: 400 }
      );
    }

    if (!text || text.trim() === '') {
      return NextResponse.json(
        { error: 'Comment text is required to post a comment' },
        { status: 400 }
      );
    }

    // Verify delivery exists
    const delivery = await prisma.delivery.findUnique({
      where: { token }
    });

    if (!delivery) {
      return NextResponse.json({ error: 'Delivery link not found' }, { status: 404 });
    }

    // Check if comments are enabled
    if (!delivery.commentsEnabled) {
      return NextResponse.json(
        { error: 'Comments are disabled for this delivery workspace' },
        { status: 403 }
      );
    }

    // Verify renderId exists if specified
    if (renderId) {
      const renderExists = await prisma.render.findUnique({
        where: { id: renderId }
      });
      if (!renderExists) {
        return NextResponse.json(
          { error: 'Render variation not found' },
          { status: 404 }
        );
      }
    }

    const commentId = `comment_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const comment = await prisma.deliveryComment.create({
      data: {
        id: commentId,
        deliveryId: delivery.id,
        renderId: renderId || null,
        author: author.trim(),
        text: text.trim()
      }
    });

    return NextResponse.json(comment, { status: 201 });

  } catch (error: any) {
    console.error('[Delivery Comment POST API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error saving comment' },
      { status: 500 }
    );
  }
}
