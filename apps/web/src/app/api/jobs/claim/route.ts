import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

async function recoverStaleJobs() {
  try {
    const staleThreshold = new Date(Date.now() - 30 * 1000); // 30 seconds
    const staleJobs = await prisma.renderJob.findMany({
      where: {
        status: { in: ['claimed', 'processing'] },
        OR: [
          { worker: null },
          { worker: { status: 'offline' } },
          { worker: { lastHeartbeat: { lt: staleThreshold } } },
          { worker: { lastHeartbeat: null } }
        ]
      },
      include: {
        worker: true
      }
    });

    if (staleJobs.length === 0) return;

    for (const job of staleJobs) {
      const retryCount = job.retryCount ?? 0;
      const maxRetries = job.maxRetries ?? 3;
      const workerId = job.workerId || 'unknown';

      if (retryCount < maxRetries) {
        const newRetry = retryCount + 1;
        await prisma.$transaction(async (tx) => {
          await tx.renderJob.update({
            where: { id: job.id },
            data: {
              status: 'queued',
              retryCount: newRetry,
              failedAt: new Date(),
              errorMessage: `Worker offline. Rescheduled (Retry ${newRetry}/${maxRetries}).`,
              workerId: null
            }
          });

          await tx.jobEvent.create({
            data: {
              id: `event_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              jobId: job.id,
              eventType: 'queued',
              message: `Stale job recovered. Previous worker: ${workerId}. Rescheduled for retry.`,
            }
          });
        });
        console.log(`[Stale Job Recovery]: Rescheduled job ${job.id} (Retry ${newRetry}/${maxRetries})`);
      } else {
        await prisma.$transaction(async (tx) => {
          await tx.renderJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              failedAt: new Date(),
              errorMessage: 'Job failed: Worker heartbeat went offline too long (stale claimed job recovery limit reached).'
            }
          });

          await tx.jobEvent.create({
            data: {
              id: `event_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              jobId: job.id,
              eventType: 'failed',
              message: 'Job failed: Worker offline. Max retries exceeded.',
            }
          });
        });
        console.log(`[Stale Job Recovery]: Failed job ${job.id} (Max retries exceeded)`);
      }
    }
  } catch (err: any) {
    console.error('[Stale Job Recovery Error]:', err.message);
  }
}

/**
 * POST: Atomic claim handler for local workstation worker nodes.
 * Locks the oldest 'queued' job using a transaction (FOR UPDATE SKIP LOCKED) to prevent race conditions.
 */
export async function POST(request: Request) {
  try {
    await recoverStaleJobs();
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { workerId } = body;

    if (!workerId || workerId.trim() === '') {
      return NextResponse.json(
        { error: 'workerId is required to claim a job' },
        { status: 400 }
      );
    }

    // Atomic transaction using PostgreSQL FOR UPDATE SKIP LOCKED
    const claimedJob = await prisma.$transaction(async (tx) => {
      // Find the oldest queued job and lock its row, skipping already locked ones
      const jobs = await tx.$queryRaw<any[]>`
        SELECT id FROM render_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      if (!jobs || jobs.length === 0) {
        return null; // No jobs available
      }

      const targetJobId = jobs[0].id;

      // Update the job status and assign the claiming worker
      const updatedJob = await tx.renderJob.update({
        where: { id: targetJobId },
        data: {
          status: 'claimed',
          workerId: workerId.trim(),
        },
        include: {
          project: {
            select: {
              name: true,
              projectType: true,
              sceneType: true,
              stylePreference: true,
              notes: true,
              projectFiles: {
                orderBy: { createdAt: 'desc' }
              }
            }
          }
        }
      });

      // Write claiming event logs
      await tx.jobEvent.create({
        data: {
          id: `event_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          jobId: targetJobId,
          eventType: 'claimed',
          message: `Render job claimed by workstation worker node: ${workerId.trim()}`,
        }
      });

      return updatedJob;
    });

    if (!claimedJob) {
      return NextResponse.json(
        { message: 'No queued render jobs available' },
        { status: 200 }
      );
    }

    return NextResponse.json(claimedJob, { status: 200 });

  } catch (error: any) {
    console.error('[Jobs Claim API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error processing job claim transaction' },
      { status: 500 }
    );
  }
}
