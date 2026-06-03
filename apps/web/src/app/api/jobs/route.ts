import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '../../../lib/db';
import { STYLE_PRESETS } from '../../../lib/style-presets';

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
 * GET: Lists render jobs, optionally filtered by projectId.
 */
export async function GET(request: Request) {
  try {
    await recoverStaleJobs();
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

    const { projectId, settingsJson, forceRegenerate } = body;

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

    if (userSettings.job_type === 'upscale_selected' || userSettings.jobType === 'upscale_selected') {
      const renderId = userSettings.renderId;
      if (!renderId) {
        return NextResponse.json(
          { error: 'renderId is required for upscale_selected job' },
          { status: 400 }
        );
      }

      // Verify the render exists
      const render = await prisma.render.findUnique({
        where: { id: renderId }
      });
      if (!render) {
        return NextResponse.json(
          { error: 'Selected render not found' },
          { status: 404 }
        );
      }

      const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const jobSettings = JSON.stringify({
        job_type: 'upscale_selected',
        renderId: renderId,
        projectId: projectId
      });

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
            id: `event_${Date.now()}_${Math.floor(Date.now() % 1000)}`,
            jobId: jobId,
            eventType: 'queued',
            message: `Upscale job queued for variation render ID: ${renderId}.`,
            detailsJson: jobSettings,
          }
        });

        return createdJob;
      });

      return NextResponse.json(newJob, { status: 201 });
    }

    const requestedStyleId = userSettings.styleId || userSettings.stylePreference || project.stylePreference || 'style_mod_lux_ext';
    const sceneType = userSettings.sceneType || project.sceneType || 'Exterior';
    const projectType = userSettings.projectType || project.projectType || 'Residential';
    const materialChoices = userSettings.materialChoices || [];

    // Find style preset matching requestedStyleId
    const stylePreset = STYLE_PRESETS.find(s => s.id === requestedStyleId || s.name === requestedStyleId) || STYLE_PRESETS[0];

    // Compile Preset Defaults
    const presetDefaults = {
      prompt: stylePreset.promptTemplate,
      negativePrompt: stylePreset.negativePrompt,
      stylePreference: stylePreset.name,
      styleId: stylePreset.id,
      geometryLockMode: stylePreset.defaultGeometryLockMode,
      ...stylePreset.defaultSettings,
    };

    let finalSettings: Record<string, any> = { ...presetDefaults };

    // Query preference memory for the best matching settings from past approvals
    let memoryApplied = false;
    let memorySource = '';
    try {
      const activeProjectMeta = {
        projectType,
        sceneType,
        stylePreference: stylePreset.name
      };
      
      const memorySettings = await findBestMemoryMatch(activeProjectMeta);
      if (memorySettings) {
        // Exclude internal _memory keys before merging
        const { _memory_scope, _memory_score, _memory_source_render, ...restMemory } = memorySettings;
        finalSettings = { ...finalSettings, ...restMemory };
        memoryApplied = true;
        memorySource = _memory_scope || '';
      }
    } catch (memoryErr: any) {
      // Memory lookup is non-blocking — log but don't fail job creation
      console.error('[Preference Memory Lookup Error]:', memoryErr.message);
    }

    // Retrieve locked material mappings from the database for this project
    let dbLockedMaterials: string[] = [];
    try {
      const lockedMappings = await prisma.materialMapping.findMany({
        where: {
          projectId: projectId,
          locked: true
        }
      });
      dbLockedMaterials = lockedMappings.map(m => {
        const finish = (m.selectedMaterial || '').trim();
        const zone = (m.detectedClass || '').trim();
        if (finish && zone) {
          return `${finish} ${zone}`;
        }
        return finish || zone;
      }).filter(Boolean);
    } catch (dbErr: any) {
      console.error('[Jobs DB Materials Query Error]:', dbErr.message);
    }

    // Merge UI material choices and database locked material choices
    const combinedMaterials = Array.from(new Set([
      ...materialChoices,
      ...dbLockedMaterials
    ]));

    // Compile prompt using the prompt builder combining chosen components
    const baseTemplate = finalSettings.prompt || stylePreset.promptTemplate;
    const finalPrompt = buildFinalPrompt({
      projectType,
      sceneType,
      stylePromptTemplate: baseTemplate,
      materialChoices: combinedMaterials,
      memoryPrompt: memoryApplied ? finalSettings.prompt : undefined
    });

    finalSettings.prompt = finalPrompt;
    finalSettings.negativePrompt = userSettings.negativePrompt || finalSettings.negativePrompt || stylePreset.negativePrompt;
    
    // Explicit user selections
    finalSettings.projectType = projectType;
    finalSettings.sceneType = sceneType;
    finalSettings.materialChoices = combinedMaterials;

    // Apply any explicit technical overrides if present (just in case)
    if (userSettings.steps) finalSettings.steps = userSettings.steps;
    if (userSettings.cfg_scale) finalSettings.cfg_scale = userSettings.cfg_scale;
    if (userSettings.denoise !== undefined) finalSettings.denoise = userSettings.denoise;
    
    // Validate and set geometryLockMode, defaulting to 'accurate'
    let geometryLockMode = userSettings.geometryLockMode || finalSettings.geometryLockMode || 'accurate';
    const validModes = ['creative', 'balanced', 'accurate', 'technical'];
    if (!validModes.includes(geometryLockMode.toLowerCase())) {
      geometryLockMode = 'accurate';
    }
    finalSettings.geometryLockMode = geometryLockMode.toLowerCase();

    if (userSettings.seed) finalSettings.seed = userSettings.seed;

    // Compute deterministic cache key from render-critical parameters
    const inputFileUrl = project.projectFiles[0]?.fileUrl || '';
    const cacheKey = computeCacheKey({
      inputFileUrl,
      styleId: stylePreset.id,
      prompt: finalSettings.prompt,
      geometryLockMode: finalSettings.geometryLockMode,
      seed: finalSettings.seed || null,
      settingsSnapshot: finalSettings,
    });

    // Check for existing completed render with the same cache key
    if (!forceRegenerate) {
      try {
        const existingRender = await prisma.render.findFirst({
          where: {
            cacheKey: cacheKey,
            OR: [
              { finalUrl: { not: null } },
              { previewUrl: { not: null } },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingRender) {
          return NextResponse.json(
            { cached: true, render: existingRender },
            { status: 200 }
          );
        }
      } catch (cacheErr: any) {
        // Cache lookup is non-blocking — log but don't fail job creation
        console.error('[Render Cache Lookup Error]:', cacheErr.message);
      }
    }

    // Attach cacheKey to settings so the worker can persist it on the render record
    finalSettings.cacheKey = cacheKey;

    const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const jobSettings = JSON.stringify(finalSettings);

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

/**
 * Prompt Builder: Combines project type, scene type, selected style template,
 * and clicked material choices into a clean final prompt.
 */
function buildFinalPrompt({
  projectType,
  sceneType,
  stylePromptTemplate,
  materialChoices,
  memoryPrompt,
}: {
  projectType: string;
  sceneType: string;
  stylePromptTemplate: string;
  materialChoices: string[];
  memoryPrompt?: string;
}) {
  let promptParts: string[] = [];

  // 1. Scene context & project type as primary attention weight
  const context = `architectural visualization of a ${projectType.toLowerCase()} ${sceneType.toLowerCase()}`;
  promptParts.push(context);

  // 2. Add style base template
  promptParts.push(stylePromptTemplate);

  // 3. Add material choices highlight tags
  if (materialChoices && materialChoices.length > 0) {
    const materialsStr = materialChoices.map(m => m.toLowerCase()).join(', ');
    promptParts.push(`with material highlights of ${materialsStr}`);
  }

  // 4. Memory additions if applicable
  if (memoryPrompt && memoryPrompt !== stylePromptTemplate) {
    // Only append if it's different to avoid duplicate prompt segments
    promptParts.push(`fine-tuned details: ${memoryPrompt}`);
  }

  return promptParts
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Computes a deterministic MD5-based cache key from the render-critical parameters.
 * Used to detect duplicate render requests and skip redundant GPU work.
 */
function computeCacheKey(params: {
  inputFileUrl: string;
  styleId: string;
  prompt: string;
  geometryLockMode: string;
  seed: number | string | null;
  settingsSnapshot: Record<string, any>;
}): string {
  const inputHash = createHash('md5').update(params.inputFileUrl).digest('hex').slice(0, 12);
  const promptHash = createHash('md5').update(params.prompt || '').digest('hex').slice(0, 12);

  // Build a stable settings fingerprint excluding volatile keys
  const { cacheKey: _ck, prompt: _p, negativePrompt: _np, materialChoices: _mc, ...stableSettings } = params.settingsSnapshot;
  const settingsHash = createHash('md5')
    .update(JSON.stringify(stableSettings, Object.keys(stableSettings).sort()))
    .digest('hex')
    .slice(0, 12);

  const seedStr = params.seed != null ? String(params.seed) : 'auto';

  return `rp_${inputHash}_${params.styleId}_${promptHash}_${params.geometryLockMode}_${seedStr}_${settingsHash}`;
}
