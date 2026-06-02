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
 * Before creating the job, queries preference_memory for the best matching settings
 * from previously approved renders and merges them into the job settings.
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

    // Parse the incoming user settings
    let userSettings: Record<string, any> = {};
    try {
      userSettings = JSON.parse(settingsJson || '{}');
    } catch {
      userSettings = {};
    }

    // Query preference memory for the best matching settings from past approvals
    let memoryApplied = false;
    let memorySource = '';
    try {
      const memorySettings = await findBestMemoryMatch(project);
      if (memorySettings) {
        // Merge memory values as defaults — user-explicit settings always take priority
        const mergedSettings = { ...memorySettings, ...userSettings };
        userSettings = mergedSettings;
        memoryApplied = true;
        memorySource = memorySettings._memory_scope || '';
      }
    } catch (memoryErr: any) {
      // Memory lookup is non-blocking — log but don't fail job creation
      console.error('[Preference Memory Lookup Error]:', memoryErr.message);
    }

    const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const jobSettings = JSON.stringify(userSettings);

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

      // Log the standard queued event
      await tx.jobEvent.create({
        data: {
          id: `event_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          jobId: jobId,
          eventType: 'queued',
          message: 'Render job created and queued for processing.',
          detailsJson: jobSettings,
        }
      });

      // If memory settings were applied, log an additional event for traceability
      if (memoryApplied) {
        await tx.jobEvent.create({
          data: {
            id: `event_${Date.now()}_${Math.floor(Math.random() * 1000 + 1)}`,
            jobId: jobId,
            eventType: 'memory_applied',
            message: `Preference memory applied from scope: ${memorySource}. Settings merged from previously approved renders.`,
            detailsJson: JSON.stringify({ memoryScope: memorySource }),
          }
        });
      }

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

/**
 * Queries the preference_memory table for the best matching settings for this project.
 * Uses a tiered scope matching strategy:
 *   1. Exact: project_type:scene_type:style_preference
 *   2. Partial: project_type:scene_type:*
 *   3. Broad: project_type:*:*
 * Returns the highest-scored match, or null if no memory exists.
 */
async function findBestMemoryMatch(
  project: { projectType: string | null; sceneType: string | null; stylePreference: string | null }
): Promise<Record<string, any> | null> {
  const projectType = (project.projectType || 'general').toLowerCase().trim();
  const sceneType = (project.sceneType || 'general').toLowerCase().trim();
  const stylePref = (project.stylePreference || 'default').toLowerCase().trim();

  const memoryKey = 'render_settings';

  // Tiered scope matching — try most specific first, then broaden
  const scopeCandidates = [
    `${projectType}:${sceneType}:${stylePref}`,
    `${projectType}:${sceneType}`,
    `${projectType}`,
  ];

  for (const scopePrefix of scopeCandidates) {
    const match = await prisma.preferenceMemory.findFirst({
      where: {
        key: memoryKey,
        scope: { startsWith: scopePrefix },
      },
      orderBy: { score: 'desc' },
    });

    if (match) {
      let memoryValue: Record<string, any> = {};
      try {
        memoryValue = JSON.parse(match.valueJson || '{}');
      } catch {
        continue;
      }

      // Extract render-relevant settings only (exclude metadata fields)
      const renderSettings: Record<string, any> = {};

      if (memoryValue.prompt) renderSettings.prompt = memoryValue.prompt;
      if (memoryValue.negative_prompt) renderSettings.negativePrompt = memoryValue.negative_prompt;
      if (memoryValue.steps) renderSettings.steps = memoryValue.steps;
      if (memoryValue.cfg_scale) renderSettings.cfg_scale = memoryValue.cfg_scale;
      if (memoryValue.denoise !== undefined) renderSettings.denoise = memoryValue.denoise;
      if (memoryValue.seed) renderSettings.seed = memoryValue.seed;
      if (memoryValue.style_id) renderSettings.stylePreference = memoryValue.style_id;
      if (memoryValue.geometry_lock_mode) renderSettings.geometryLockMode = memoryValue.geometry_lock_mode;
      if (memoryValue.material_choices?.length) renderSettings.materialChoices = memoryValue.material_choices;

      // Tag with the memory scope for traceability in job events
      renderSettings._memory_scope = match.scope;
      renderSettings._memory_score = match.score;
      renderSettings._memory_source_render = match.sourceRenderId;

      return renderSettings;
    }
  }

  return null;
}
