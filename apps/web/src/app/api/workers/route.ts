import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET: Lists all registered workers, dynamically checking heartbeats to label inactive machines as offline.
 */
export async function GET() {
  try {
    const workers = await prisma.worker.findMany({
      orderBy: { name: 'asc' },
    });

    const now = Date.now();
    const evaluatedWorkers = workers.map((worker) => {
      const lastSeen = worker.lastSeenAt || worker.lastHeartbeat;
      // If last_seen_at is older than 60 seconds (60000ms) or not present, it's offline
      const isOffline = !lastSeen || (now - new Date(lastSeen).getTime() > 60000);
      
      return {
        ...worker,
        status: isOffline ? 'offline' : worker.status,
      };
    });

    return NextResponse.json(evaluatedWorkers, { status: 200 });

  } catch (error: any) {
    console.error('[Workers GET API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching workers status telemetry' },
      { status: 500 }
    );
  }
}
