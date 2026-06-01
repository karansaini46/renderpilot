import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET: Lists render jobs, optionally filtered by projectId.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    const jobs = await prisma.renderJob.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { name: true }
        }
      }
    });

    return NextResponse.json(jobs, { status: 200 });

  } catch (error: any) {
    console.error('[Jobs GET API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching jobs queue' },
      { status: 500 }
    );
  }
}

/**
 * POST: Queues a new rendering job for a project, validating that an input file exists.
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

    const { projectId, settingsJson } = body;

    if (!projectId || projectId.trim() === '') {
      return NextResponse.json(
        { error: 'projectId is required to queue a render job' },
        { status: 400 }
      );
    }

    // Verify that the project actually exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        projectFiles: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify that the project contains at least one input file
    if (!project.projectFiles || project.projectFiles.length === 0) {
      return NextResponse.json(
        { error: 'Cannot create render job: No input files associated with this project. Please upload an image input first.' },
        { status: 400 }
      );
    }

    const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const jobSettings = settingsJson || '{}';

    // Create the job and its initial event log record inside a transaction
    const newJob = await prisma.$transaction(async (tx) => {
      const createdJob = await tx.renderJob.create({
        data: {
          id: jobId,
          projectId: projectId,
          status: 'queued',
          progress: 0,
          settingsJson: jobSettings,
        }
      });

      await tx.jobEvent.create({
        data: {
          id: `event_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          jobId: jobId,
          eventType: 'queued',
          message: 'Render job created and queued for processing.',
          detailsJson: jobSettings,
        }
      });

      return createdJob;
    });

    return NextResponse.json(newJob, { status: 201 });

  } catch (error: any) {
    console.error('[Jobs POST API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error queueing render job' },
      { status: 500 }
    );
  }
}
