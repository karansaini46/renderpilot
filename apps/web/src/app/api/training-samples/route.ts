import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET: Lists all training sample candidates, including style metadata.
 */
export async function GET(request: Request) {
  try {
    const samples = await prisma.trainingSample.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        style: {
          select: { name: true }
        },
        render: {
          select: {
            prompt: true,
            negativePrompt: true,
            project: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json(samples, { status: 200 });
  } catch (error: any) {
    console.error('[Training Samples GET Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching training samples' },
      { status: 500 }
    );
  }
}

/**
 * POST: Handles updating or deleting training sample candidates.
 * Body signature:
 * {
 *   action: 'approve' | 'split' | 'caption' | 'delete',
 *   id: string,
 *   approvedForTraining?: boolean,
 *   datasetSplit?: string,
 *   caption?: string
 * }
 */
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

    const { action, id, approvedForTraining, datasetSplit, caption } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter 'id'" },
        { status: 400 }
      );
    }

    // Verify candidate exists
    const candidate = await prisma.trainingSample.findUnique({
      where: { id }
    });

    if (!candidate) {
      return NextResponse.json(
        { error: 'Training sample candidate not found' },
        { status: 404 }
      );
    }

    if (action === 'delete') {
      await prisma.trainingSample.delete({
        where: { id }
      });
      return NextResponse.json({ success: true, message: 'Candidate excluded successfully' }, { status: 200 });
    }

    if (action === 'approve') {
      const updated = await prisma.trainingSample.update({
        where: { id },
        data: {
          approvedForTraining: approvedForTraining !== undefined ? !!approvedForTraining : !candidate.approvedForTraining
        }
      });
      return NextResponse.json(updated, { status: 200 });
    }

    if (action === 'split') {
      if (!datasetSplit || !['train', 'validation', 'test'].includes(datasetSplit)) {
        return NextResponse.json(
          { error: "Invalid split. Must be 'train', 'validation', or 'test'" },
          { status: 400 }
        );
      }
      const updated = await prisma.trainingSample.update({
        where: { id },
        data: { datasetSplit }
      });
      return NextResponse.json(updated, { status: 200 });
    }

    if (action === 'caption') {
      const updated = await prisma.trainingSample.update({
        where: { id },
        data: { caption: caption || '' }
      });
      return NextResponse.json(updated, { status: 200 });
    }

    return NextResponse.json(
      { error: "Unsupported action. Action must be 'approve', 'split', 'caption', or 'delete'" },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('[Training Samples POST Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error updating training sample' },
      { status: 500 }
    );
  }
}
