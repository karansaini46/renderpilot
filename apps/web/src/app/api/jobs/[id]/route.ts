import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET: Retrieves the status, progress, and logs of a single render job by ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.renderJob.findUnique({
      where: { id },
      include: {
        jobEvents: {
          orderBy: { createdAt: 'asc' }
        },
        project: {
          select: { name: true }
        }
      }
    });

    if (!job) {
      return NextResponse.json({ error: 'Render job not found' }, { status: 404 });
    }

    return NextResponse.json(job, { status: 200 });

  } catch (error: any) {
    console.error('[Job ID GET API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching render job status' },
      { status: 500 }
    );
  }
}
