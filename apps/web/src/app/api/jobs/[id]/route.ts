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

/**
 * PATCH: Handles user selection of a camera candidate, re-queuing the job for full rendering.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { cameraIndex } = body;

    if (cameraIndex === undefined || typeof cameraIndex !== 'number') {
      return NextResponse.json({ error: 'cameraIndex must be a number' }, { status: 400 });
    }

    const job = await prisma.renderJob.findUnique({
      where: { id }
    });

    if (!job) {
      return NextResponse.json({ error: 'Render job not found' }, { status: 404 });
    }

    if (job.status !== 'waiting_for_camera') {
      return NextResponse.json(
        { error: `Cannot select camera for a job with status: ${job.status}` },
        { status: 400 }
      );
    }

    const settings = job.settingsJson ? JSON.parse(job.settingsJson) : {};
    const candidates = settings.camera_candidates || [];

    const selectedCamera = candidates.find((c: any) => c.index === cameraIndex);
    if (!selectedCamera) {
      return NextResponse.json(
        { error: `Camera candidate with index ${cameraIndex} not found` },
        { status: 400 }
      );
    }

    // Update settings, set status to queued, and progress to 0
    settings.selected_camera = selectedCamera;
    const updatedSettingsJson = JSON.stringify(settings);

    const updatedJob = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.renderJob.update({
        where: { id },
        data: {
          status: 'queued',
          progress: 0,
          settingsJson: updatedSettingsJson,
        }
      });

      await tx.jobEvent.create({
        data: {
          id: `event_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          jobId: id,
          eventType: 'queued',
          message: `User selected camera perspective: ${selectedCamera.name || 'custom'}. Re-queued for rendering.`,
        }
      });

      return updated;
    });

    return NextResponse.json(updatedJob, { status: 200 });

  } catch (error: any) {
    console.error('[Job ID PATCH API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error processing camera selection' },
      { status: 500 }
    );
  }
}
