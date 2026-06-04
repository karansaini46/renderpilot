import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Queue statuses
    const [queuedJobs, completedJobsCount, failedJobs] = await Promise.all([
      prisma.renderJob.count({ where: { status: 'queued' } }),
      prisma.renderJob.count({ where: { status: 'completed' } }),
      prisma.renderJob.count({ where: { status: 'failed' } }),
    ]);

    // 2. Average processing time of the last 1000 completed jobs (to keep it fast and scalable)
    const completedJobsList = await prisma.renderJob.findMany({
      where: {
        status: 'completed',
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: 1000,
    });

    let totalDurationMs = 0;
    completedJobsList.forEach((job) => {
      if (job.completedAt) {
        totalDurationMs += job.completedAt.getTime() - job.createdAt.getTime();
      }
    });

    const averageProcessingTime = completedJobsList.length > 0
      ? totalDurationMs / completedJobsList.length / 1000
      : 0;

    // 3. Worker statuses & metadata
    const workers = await prisma.worker.findMany({
      orderBy: { name: 'asc' },
    });

    // 4. Current active/processing jobs progress
    const activeJobs = await prisma.renderJob.findMany({
      where: {
        status: { in: ['claimed', 'processing'] },
      },
      select: {
        id: true,
        projectId: true,
        progress: true,
        status: true,
        createdAt: true,
        worker: {
          select: {
            name: true,
          },
        },
        project: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 5. Average variations (renders per project)
    const [totalRenders, totalProjects] = await Promise.all([
      prisma.render.count(),
      prisma.project.count(),
    ]);
    const averageVariationCount = totalProjects > 0
      ? totalRenders / totalProjects
      : 0;

    // 6. Cache hit count (renders matching duplicate cache keys)
    const rendersWithCacheKey = await prisma.render.findMany({
      where: {
        cacheKey: { not: null },
      },
      select: {
        cacheKey: true,
      },
    });

    const cacheKeyMap = new Map<string, number>();
    rendersWithCacheKey.forEach((r) => {
      if (r.cacheKey) {
        cacheKeyMap.set(r.cacheKey, (cacheKeyMap.get(r.cacheKey) || 0) + 1);
      }
    });

    let cacheHitCount = 0;
    cacheKeyMap.forEach((count) => {
      if (count > 1) {
        // First render is the cache generator, remaining are hits
        cacheHitCount += (count - 1);
      }
    });

    // 7. Upscales run (completed jobs containing upscale settings)
    const upscalesRun = await prisma.renderJob.count({
      where: {
        status: 'completed',
        OR: [
          { settingsJson: { contains: '"job_type":"upscale_selected"' } },
          { settingsJson: { contains: '"jobType":"upscale_selected"' } },
        ],
      },
    });

    return NextResponse.json(
      {
        queuedJobs,
        completedJobs: completedJobsCount,
        failedJobs,
        averageProcessingTime,
        workers,
        activeJobs,
        averageVariationCount,
        cacheHitCount,
        upscalesRun,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Admin Metrics API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching admin operational metrics' },
      { status: 500 }
    );
  }
}
