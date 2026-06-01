import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST: Registers/updates worker node heartbeats and capability details.
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

    const { workerId, machineName, status, currentJobId, gpuName, vramGb, mode } = body;

    if (!workerId || workerId.trim() === '') {
      return NextResponse.json(
        { error: 'workerId is required to report heartbeat' },
        { status: 400 }
      );
    }

    if (!machineName || machineName.trim() === '') {
      return NextResponse.json(
        { error: 'machineName is required to report heartbeat' },
        { status: 400 }
      );
    }

    const now = new Date();

    // Perform upsert of the worker telemetry record
    const worker = await prisma.worker.upsert({
      where: { id: workerId.trim() },
      update: {
        name: machineName.trim(),
        status: status || 'online',
        lastHeartbeat: now,
        lastSeenAt: now,
        currentJobId: currentJobId || null,
        gpuName: gpuName || null,
        vramGb: vramGb ? parseInt(vramGb) : null,
        mode: mode || 'idle',
      },
      create: {
        id: workerId.trim(),
        name: machineName.trim(),
        status: status || 'online',
        lastHeartbeat: now,
        lastSeenAt: now,
        currentJobId: currentJobId || null,
        gpuName: gpuName || null,
        vramGb: vramGb ? parseInt(vramGb) : null,
        mode: mode || 'idle',
      },
    });

    return NextResponse.json(worker, { status: 200 });

  } catch (error: any) {
    console.error('[Worker Heartbeat API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error recording worker heartbeat' },
      { status: 500 }
    );
  }
}
