import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * Default laptop capacity profile. These limits prevent VRAM exhaustion
 * and thermal issues on consumer GPU hardware.
 */
const DEFAULT_LAPTOP_PROFILE = {
  max_concurrent_jobs: 1,
  max_preview_resolution: 768,
  max_variations_per_job: 4,
  sequential_variations: true,
  sdxl_enabled: false,
  video_enabled: false,
  parallel_comfyui_jobs: false,
  upscale_approved_only: true,
};

/**
 * GET: Returns the capacity guardrails for a specific worker, or the
 * default laptop profile if no worker-specific overrides exist.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get('workerId');

    if (workerId) {
      const worker = await prisma.worker.findUnique({
        where: { id: workerId },
        select: { settingsJson: true },
      });

      if (worker?.settingsJson) {
        try {
          const parsed = JSON.parse(worker.settingsJson);
          const capacity = parsed.capacity || {};
          return NextResponse.json(
            { ...DEFAULT_LAPTOP_PROFILE, ...capacity },
            { status: 200 }
          );
        } catch {
          // Fall through to default
        }
      }
    }

    return NextResponse.json(DEFAULT_LAPTOP_PROFILE, { status: 200 });

  } catch (error: any) {
    console.error('[Capacity GET Error]:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch capacity profile' },
      { status: 500 }
    );
  }
}

/**
 * PUT: Updates the capacity guardrails for a specific worker, persisting
 * them into the worker's settings_json column.
 */
export async function PUT(request: Request) {
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

    const { workerId, capacity } = body;

    if (!workerId || !workerId.trim()) {
      return NextResponse.json(
        { error: 'workerId is required' },
        { status: 400 }
      );
    }

    if (!capacity || typeof capacity !== 'object') {
      return NextResponse.json(
        { error: 'capacity object is required' },
        { status: 400 }
      );
    }

    // Validate numeric bounds
    if (capacity.max_concurrent_jobs !== undefined) {
      const val = Number(capacity.max_concurrent_jobs);
      if (isNaN(val) || val < 1 || val > 8) {
        return NextResponse.json(
          { error: 'max_concurrent_jobs must be between 1 and 8' },
          { status: 400 }
        );
      }
    }

    if (capacity.max_preview_resolution !== undefined) {
      const val = Number(capacity.max_preview_resolution);
      if (isNaN(val) || val < 256 || val > 2048) {
        return NextResponse.json(
          { error: 'max_preview_resolution must be between 256 and 2048' },
          { status: 400 }
        );
      }
    }

    if (capacity.max_variations_per_job !== undefined) {
      const val = Number(capacity.max_variations_per_job);
      if (isNaN(val) || val < 1 || val > 16) {
        return NextResponse.json(
          { error: 'max_variations_per_job must be between 1 and 16' },
          { status: 400 }
        );
      }
    }

    // Merge capacity into existing settings_json
    const worker = await prisma.worker.findUnique({
      where: { id: workerId.trim() },
      select: { settingsJson: true },
    });

    let existingSettings: Record<string, any> = {};
    if (worker?.settingsJson) {
      try {
        existingSettings = JSON.parse(worker.settingsJson);
      } catch {
        existingSettings = {};
      }
    }

    const mergedCapacity = {
      ...DEFAULT_LAPTOP_PROFILE,
      ...(existingSettings.capacity || {}),
      ...capacity,
    };

    existingSettings.capacity = mergedCapacity;

    const updated = await prisma.worker.update({
      where: { id: workerId.trim() },
      data: {
        settingsJson: JSON.stringify(existingSettings),
      },
    });

    return NextResponse.json(
      { workerId: updated.id, capacity: mergedCapacity },
      { status: 200 }
    );

  } catch (error: any) {
    console.error('[Capacity PUT Error]:', error.message);
    return NextResponse.json(
      { error: 'Failed to update capacity profile' },
      { status: 500 }
    );
  }
}
