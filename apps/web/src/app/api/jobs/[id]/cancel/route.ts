import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST: Cancels a queued or claimed render job, updating status to failed and logging a cancel event.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.renderJob.findUnique({
      where: { id }
    });

    if (!job) {
      return NextResponse.json({ error: 'Render job not found' }, { status: 404 });
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json(
        { error: `Cannot cancel job. Current status is already: ${job.status}` },
        { status: 400 }
      );
    }

    // Perform cancel updates inside a transaction
    const updatedJob = await prisma.$transaction(async (tx) => {
      const updated = await tx.renderJob.update({
        where: { id },
        data: {
          status: 'failed',
          errorMessage: 'Job execution was cancelled by the administrator.',
          completedAt: new Date(),
        }
      });

      await tx.jobEvent.create({
        data: {
          id: `event_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          jobId: id,
          eventType: 'failed',
          message: 'Render job execution was cancelled by user request.',
        }
      });

      return updated;
    });

    return NextResponse.json(updatedJob, { status: 200 });

  } catch (error: any) {
    console.error('[Job ID Cancel API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error processing job cancellation request' },
      { status: 500 }
    );
  }
}
