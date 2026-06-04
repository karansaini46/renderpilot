import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST: Handles status transitions, progress logs, error messages, and final render outputs registration for a job.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { status, progress, errorMessage, renderData } = body;

    if (!status) {
      return NextResponse.json(
        { error: 'status is required to execute progress updates' },
        { status: 400 }
      );
    }

    const job = await prisma.renderJob.findUnique({
      where: { id }
    });

    if (!job) {
      return NextResponse.json({ error: 'Render job not found' }, { status: 404 });
    }

    const updatedJob = await prisma.$transaction(async (tx: any) => {
      // 1. Update status parameters on the job row
      const updated = await tx.renderJob.update({
        where: { id },
        data: {
          status,
          progress: progress !== undefined ? progress : (status === 'completed' ? 100 : job.progress),
          errorMessage: errorMessage || null,
          completedAt: status === 'completed' || status === 'failed' ? new Date() : null,
        }
      });

      // 2. Generate a corresponding transition event entry in job_events
      let logMessage = `Render job status transitioned to: ${status}.`;
      if (progress !== undefined) logMessage += ` Progress updated to ${progress}%.`;
      if (errorMessage) logMessage += ` Error details: ${errorMessage}`;

      await tx.jobEvent.create({
        data: {
          id: `event_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          jobId: id,
          eventType: status,
          message: logMessage,
        }
      });

      // 3. Register render outputs if the job has completed successfully
      if (status === 'completed' && renderData) {
        const renderId = `render_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        await tx.render.create({
          data: {
            id: renderId,
            jobId: id,
            projectId: job.projectId,
            finalImageUrl: renderData.finalImageUrl,
            prompt: renderData.prompt || 'Architectural visualization rendering',
            negativePrompt: renderData.negativePrompt || '',
            seed: renderData.seed ? BigInt(renderData.seed) : null,
          }
        });
      }

      return updated;
    });

    return NextResponse.json(updatedJob, { status: 200 });

  } catch (error: any) {
    console.error('[Job ID Status API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error processing job status transition' },
      { status: 500 }
    );
  }
}
