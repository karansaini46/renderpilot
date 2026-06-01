import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST: Persists or updates evaluation feedback and quality ratings for a specific render variation.
 * Uses atomic upsert to ensure only one feedback record is stored per render.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: renderId } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { approved, rating, scores, action, rejectionReasons, notes } = body;

    if (approved === undefined) {
      return NextResponse.json(
        { error: "Missing required parameter: 'approved' is required" },
        { status: 400 }
      );
    }

    // 1. Verify that target render actually exists in the Neon DB
    const render = await prisma.render.findUnique({
      where: { id: renderId }
    });

    if (!render) {
      return NextResponse.json(
        { error: 'Render record not found' },
        { status: 404 }
      );
    }

    // 2. Pack sub-category ratings and action items in JSON
    const feedbackId = `feedback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const scoresJson = JSON.stringify({
      scores: scores || {},
      action: action || '',
      rejectionReasons: rejectionReasons || []
    });

    // 3. Atomically create or update the feedback row
    const feedback = await prisma.renderFeedback.upsert({
      where: { renderId: renderId },
      update: {
        approved: !!approved,
        rating: rating !== undefined ? Number(rating) : null,
        scoresJson,
        notes: notes || '',
      },
      create: {
        id: feedbackId,
        renderId: renderId,
        approved: !!approved,
        rating: rating !== undefined ? Number(rating) : null,
        scoresJson,
        notes: notes || '',
      }
    });

    return NextResponse.json(feedback, { status: 200 });

  } catch (error: any) {
    console.error('[Render Feedback POST Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error saving render feedback' },
      { status: 500 }
    );
  }
}
