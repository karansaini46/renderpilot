import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '../../../lib/db';
import { STYLE_PRESETS } from '../../../lib/style-presets';

export const dynamic = 'force-dynamic';

import { env } from '../../../config/env';
import { analyzeProjectImage } from '../../../lib/prompt-brain/gemini-provider';
import { composePrompt } from '../../../lib/prompt-brain/prompt-composer';
import { processAutoMaterialMappings } from '../../../lib/prompt-brain/material-mapper';
import { PromptBrainSchema, SCENE_TYPES } from '../../../lib/prompt-brain/types';
import { enhancePromptWithGemini } from '../../../lib/gemini-prompt-enhancer';

function createManualAnalysis(
  sceneType: string,
  projectType: string,
  materials: string[],
  materialMappings: any[]
): PromptBrainSchema {
  return {
    scene_type: (SCENE_TYPES.includes(sceneType as any) ? sceneType : 'Exterior') as any,
    confidence: 1.0,
    camera_view: {
      angle: 'standard',
      elevation: 'eye-level',
      description: 'Manual architectural perspective'
    },
    major_objects: [],
    object_priority: [],
    composition_lock: {
      description: 'Manual lock',
      lockAspects: ['overall layout'],
      riskLevel: 'medium'
    },
    materials,
    material_mappings: materialMappings.map(m => ({
      objectName: m.objectName,
      category: m.detectedClass,
      suggestedMaterial: m.selectedMaterial,
      confidence: 1.0
    })),
    texture_analysis: { description: '', dominantPatterns: [] },
    surface_behavior: { glossiness: 'medium', roughness: 'medium', metallic: 'low', details: '' },
    interior_light_analysis: { lightSources: [], dominantColorTemp: 'neutral', intensity: 'medium', description: '' },
    exterior_light_analysis: { sunPosition: 'clear sky', timeOfDay: 'daylight', weatherCondition: 'clear', shadowSharpness: 'soft', description: '' },
    mirror_analysis: { detected: false, count: 0, surfaceAreaEstimated: 'none', description: '' },
    glass_analysis: { detected: false, transparencyLevel: 'medium', reflectionLevel: 'medium', description: '' },
    reflection_guidance: { promptTriggers: [], renderSettingsAdjustment: '' },
    room_type_protection: { roomType: 'unspecified', protectedElements: [], forbiddenSubstitutions: [] },
    geometry_risks: [],
    style_safety: { styleIncompatibilities: [], promptSafetyFlags: [] },
    input_quality: { resolutionCheck: 'standard', compressionArtifacts: false, blurriness: 'none', score: 1.0 },
    workflow_recommendation: { pipeline: 'standard', steps: [], reason: '' },
    preserve_constraints: [],
    forbidden_changes: [],
    detail_enhancement_plan: { steps: [], targetAreas: [] },
    suggested_render_mode: 'img2img',
    suggested_denoise: 0.65,
    suggested_geometry_lock: 'balanced',
    positive_prompt_draft: '',
    negative_prompt_draft: '',
    risk_flags: [],
    success_criteria: [],
    user_summary: 'Manual mode prompt composition'
  };
}

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
        await prisma.$transaction(async (tx: any) => {
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
        await prisma.$transaction(async (tx: any) => {
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

    const { projectId, settingsJson, forceRegenerate, forceGemini } = body;

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

    if (userSettings.job_type === 'base_render_model' || userSettings.jobType === 'base_render_model') {
      if (process.env.BLENDER_PIPELINE_ENABLED !== 'true') {
        return NextResponse.json(
          { error: 'Blender pipeline (base_render_model) is currently disabled behind a feature flag.' },
          { status: 400 }
        );
      }
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

      const newJob = await prisma.$transaction(async (tx: any) => {
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
    let stylePreset = STYLE_PRESETS.find(s => s.id === requestedStyleId || s.name === requestedStyleId) || STYLE_PRESETS[0];

    // Guard: Verify compatibility of resolved style preset with the active sceneType
    if (stylePreset.allowedSceneTypes && !stylePreset.allowedSceneTypes.includes(sceneType)) {
      const fallbackPreset = STYLE_PRESETS.find(s => !s.allowedSceneTypes || s.allowedSceneTypes.includes(sceneType));
      if (fallbackPreset) {
        stylePreset = fallbackPreset;
      }
    }

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
    const isForceRegenerate = !!forceRegenerate || !!userSettings.forceRegenerate;
    const isForceGemini = !!forceGemini || !!userSettings.forceGemini;

    if (!isForceRegenerate) {
      try {
        const activeProjectMeta = {
          projectType,
          sceneType,
          stylePreference: stylePreset.name
        };
        
        const memorySettings = await findBestMemoryMatch(activeProjectMeta, forceRegenerate);
        if (memorySettings) {
          // Exclude internal _memory keys before merging
          const { _memory_scope, _memory_score, _memory_source_render, ...restMemory } = memorySettings;
          if (isForceGemini) {
            // Bypasses memory for prompt generation specifically but still applies other memory settings like denoise and geometryLockMode
            const { prompt, negativePrompt, ...nonPromptMemory } = restMemory;
            finalSettings = { ...finalSettings, ...nonPromptMemory };
          } else {
            finalSettings = { ...finalSettings, ...restMemory };
          }
          memoryApplied = true;
          memorySource = _memory_scope || '';
        }
      } catch (memoryErr: any) {
        // Memory lookup is non-blocking — log but don't fail job creation
        console.error('[Preference Memory Lookup Error]:', memoryErr.message);
      }
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
      dbLockedMaterials = lockedMappings.map((m: any) => {
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
    let combinedMaterials = Array.from(new Set([
      ...materialChoices,
      ...dbLockedMaterials
    ]));

    // --- PROMPT BRAIN INTEGRATION ---
    const projectFile = project.projectFiles[0];
    const pbProvider = env.PROMPT_BRAIN_PROVIDER || 'manual';
    const pbModel = env.GEMINI_MODEL || 'gemini-2.5-flash';
    
    let analysisId = '';
    let analysisResult: PromptBrainSchema | null = null;
    let finalProvider = pbProvider;
    
    // Compute deterministic analysis cache key
    const analysisCacheKey = projectFile 
      ? createHash('md5').update(`${projectFile.id}_${pbProvider}_${pbModel}`).digest('hex')
      : '';
          // Try to load cached analysis if caching is enabled
    if (projectFile && env.PROMPT_BRAIN_CACHE_ENABLED && analysisCacheKey && !isForceRegenerate) {
      try {
        const cachedAnalysis = await prisma.promptBrainAnalysis.findFirst({
          where: { cacheKey: analysisCacheKey }
        });
        if (cachedAnalysis && cachedAnalysis.provider === pbProvider) {
          analysisResult = JSON.parse(cachedAnalysis.analysisJson) as PromptBrainSchema;
          analysisId = cachedAnalysis.id;
          finalProvider = cachedAnalysis.provider as any;
          if (pbProvider === 'gemini') {
            console.log('Gemini PromptBrain skipped: cached analysis loaded');
          }
        }
      } catch (cacheErr: any) {
        console.error('[PromptBrain Cache Read Error]:', cacheErr.message);
      }
    }
    
    // If not cached or caching is disabled, run analysis
    if (!analysisResult && projectFile) {
      const isGeminiRequested = pbProvider === 'gemini' || isForceGemini;
      
      if (isGeminiRequested) {
        if (!env.GEMINI_API_KEY) {
          console.log('Gemini PromptBrain skipped: missing API key');
          finalProvider = 'manual';
        } else {
          console.log('Gemini PromptBrain attempted');
          try {
            const geminiRes = await analyzeProjectImage(project.id, sceneType);
            if (geminiRes.success && geminiRes.analysis && geminiRes.analysis.confidence >= (env.PROMPT_BRAIN_MIN_CONFIDENCE || 0.75)) {
              analysisResult = geminiRes.analysis;
              finalProvider = 'gemini';
              console.log('Gemini PromptBrain applied');

              // Run helper to process material mappings
              try {
                await processAutoMaterialMappings(project.id, analysisResult);
              } catch (mapperErr: any) {
                console.error('[PromptBrain Auto Material Mapper Error]:', mapperErr.message);
              }
            } else {
              console.warn(`[PromptBrain Gemini Fallback]: Success=${geminiRes.success}, Confidence=${geminiRes.analysis?.confidence ?? 'N/A'}`);
              finalProvider = 'manual';
              console.log('Gemini PromptBrain skipped: low confidence or unsuccessful analysis');
            }
          } catch (geminiErr: any) {
            console.error('[PromptBrain Gemini Request Error]:', geminiErr.message);
            finalProvider = 'manual';
            console.log(`Gemini PromptBrain skipped: request error ${geminiErr.message}`);
          }
        }
      } else {
        console.log('Gemini PromptBrain skipped: provider is manual');
        finalProvider = 'manual';
      }
      
      // Fallback/Manual Mode: Construct manual analysis
      if (!analysisResult) {
        const dbMappings = await prisma.materialMapping.findMany({
          where: { projectId: project.id }
        });
        analysisResult = createManualAnalysis(sceneType, projectType, combinedMaterials, dbMappings);
        finalProvider = 'manual';
      }
      
      // Save PromptBrainAnalysis row in database
      try {
        analysisId = `pba_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        await prisma.promptBrainAnalysis.create({
          data: {
            id: analysisId,
            projectId: project.id,
            projectFileId: projectFile.id,
            provider: finalProvider,
            model: finalProvider === 'gemini' ? pbModel : 'manual',
            sceneType: analysisResult.scene_type,
            confidence: analysisResult.confidence,
            analysisJson: JSON.stringify(analysisResult),
            positivePrompt: analysisResult.positive_prompt_draft || '',
            negativePrompt: analysisResult.negative_prompt_draft || '',
            renderMode: analysisResult.suggested_render_mode || 'img2img',
            denoise: analysisResult.suggested_denoise || 0.65,
            geometryLockMode: analysisResult.suggested_geometry_lock || 'balanced',
            cacheKey: analysisCacheKey,
          }
        });
      } catch (dbSaveErr: any) {
        console.error('[PromptBrain Save Error]:', dbSaveErr.message);
      }
    }

    // Merge latest database material mappings to analysisResult and reload combinedMaterials
    if (analysisResult) {
      try {
        const dbMappings = await prisma.materialMapping.findMany({
          where: { projectId: project.id }
        });

        // Convert database records to PromptBrain suggestion format
        const dbMappedSuggestions = dbMappings.map((m: any) => ({
          objectName: m.objectName,
          category: m.detectedClass as any,
          suggestedMaterial: m.selectedMaterial,
          confidence: m.locked ? 1.0 : m.confidence
        }));

        // Merge: start with DB mappings, then add suggestions from analysis for categories not present in DB
        const mergedMappings = [...dbMappedSuggestions];
        const dbCategories = new Set(dbMappedSuggestions.map(m => m.category.toLowerCase()));

        if (analysisResult.material_mappings) {
          for (const suggestion of analysisResult.material_mappings) {
            if (!dbCategories.has(suggestion.category.toLowerCase())) {
              mergedMappings.push(suggestion);
            }
          }
        }

        analysisResult.material_mappings = mergedMappings;

        // Reload locked materials list for finalSettings.materialChoices
        const reloadedLockedMaterials = dbMappings
          .filter((m: any) => m.locked)
          .map((m: any) => {
            const finish = (m.selectedMaterial || '').trim();
            const zone = (m.detectedClass || '').trim();
            if (finish && zone) {
              return `${finish} ${zone}`;
            }
            return finish || zone;
          })
          .filter(Boolean);

        combinedMaterials = Array.from(new Set([
          ...materialChoices,
          ...reloadedLockedMaterials
        ]));
      } catch (mergeErr: any) {
        console.error('[PromptBrain Database Material Merge Error]:', mergeErr.message);
      }
    }

    // Compose Prompt using Safe prompt composer
    const userPromptModifier = userSettings.promptModifier || '';
    const memoryPromptValue = (memoryApplied && finalSettings.prompt && finalSettings.prompt !== stylePreset.promptTemplate)
      ? finalSettings.prompt
      : undefined;

    const composerResult = composePrompt({
      analysis: analysisResult!,
      stylePreset,
      renderMode: userSettings.geometryLockMode ? undefined : finalSettings.geometryLockMode as any,
      promptModifier: userPromptModifier,
      memoryPrompt: memoryPromptValue
    });

    // Merge composed attributes back to settings
    finalSettings.promptBrainProvider = finalProvider;
    finalSettings.promptBrainAnalysisId = analysisId;
    finalSettings.promptBrainAnalysis = analysisResult;
    finalSettings.negativePrompt = composerResult.negativePrompt;
    finalSettings.promptSafetyReport = composerResult.promptSafetyReport;

    // Enhance prompt using Gemini
    const finalPrompt = composerResult.positivePrompt;
    let enhancedPrompt = finalPrompt;
    const geminiEnhancerStatus = { status: 'skipped' as 'applied' | 'skipped' | 'failed', error: undefined as string | undefined };

    try {
      enhancedPrompt = await enhancePromptWithGemini(finalPrompt, geminiEnhancerStatus);
    } catch (err: any) {
      geminiEnhancerStatus.status = 'failed';
      geminiEnhancerStatus.error = err.message;
      console.error('[Jobs Route Gemini Enhancement Crash Shield]:', err.message);
    }

    finalSettings.prompt = enhancedPrompt;
    
    // Explicit user selections / fallbacks
    finalSettings.projectType = projectType;
    finalSettings.sceneType = sceneType;
    finalSettings.materialChoices = combinedMaterials;
    finalSettings.renderMode = userSettings.job_type || userSettings.jobType || composerResult.renderMode;
    // Resolve mode and parameters
    const geometryLockMode = userSettings.geometryLockMode || finalSettings.geometryLockMode || composerResult.geometryLockMode || 'balanced_archviz';
    let renderMode = geometryLockMode;
    if (renderMode === 'strict_geometry' || renderMode === 'strict' || renderMode === 'accurate' || renderMode === 'technical' || renderMode === 'strict_structure') {
      renderMode = 'strict_geometry';
    } else if (renderMode === 'balanced_archviz' || renderMode === 'balanced' || renderMode === 'balanced_enhancement') {
      renderMode = 'balanced_archviz';
    } else if (renderMode === 'high_realism' || renderMode === 'creative' || renderMode === 'creative_concept') {
      renderMode = 'high_realism';
    } else {
      renderMode = 'balanced_archviz';
    }

    let denoise = userSettings.denoise !== undefined ? userSettings.denoise : composerResult.denoise;
    
    // Check stylePreset defaults for custom strengths
    let edgeStrength = userSettings.edge_control_strength !== undefined
      ? Number(userSettings.edge_control_strength)
      : (stylePreset.defaultSettings?.edge_control_strength !== undefined
        ? Number(stylePreset.defaultSettings.edge_control_strength)
        : 0.90);

    let depthStrength = userSettings.depth_control_strength !== undefined
      ? Number(userSettings.depth_control_strength)
      : (stylePreset.defaultSettings?.depth_control_strength !== undefined
        ? Number(stylePreset.defaultSettings.depth_control_strength)
        : 0.75);

    let steps = userSettings.steps !== undefined ? userSettings.steps : undefined;
    let cfgScale = userSettings.cfg_scale !== undefined ? userSettings.cfg_scale : undefined;

    if (renderMode === 'strict_geometry') {
      if (denoise === undefined || denoise === null) {
        denoise = 0.32;
      } else {
        denoise = Math.min(Math.max(Number(denoise), 0.15), 0.50);
      }
      if (userSettings.edge_control_strength === undefined) {
        edgeStrength = 0.95;
      }
      if (userSettings.depth_control_strength === undefined) {
        depthStrength = 0.80;
      }
      if (steps === undefined) {
        steps = 30;
      }
      if (cfgScale === undefined) {
        cfgScale = 6.0;
      }
      console.log('[Denoise Debug] mode:', renderMode, 'denoise:', denoise, 'source: mode_clamp')
    } else if (renderMode === 'balanced_archviz') {
      if (denoise === undefined || denoise === null) {
        denoise = 0.38;
      } else {
        denoise = Math.min(Math.max(Number(denoise), 0.15), 0.70);
      }
      if (userSettings.edge_control_strength === undefined) {
        edgeStrength = 0.90;
      }
      if (userSettings.depth_control_strength === undefined) {
        depthStrength = 0.75;
      }
      if (steps === undefined) {
        steps = 32;
      }
      if (cfgScale === undefined) {
        cfgScale = 6.5;
      }
      console.log('[Denoise Debug] mode:', renderMode, 'denoise:', denoise, 'source: mode_clamp')
    } else if (renderMode === 'high_realism') {
      if (denoise === undefined || denoise === null) {
        denoise = 0.65;
      } else {
        denoise = Math.min(Math.max(Number(denoise), 0.15), 0.90);
      }
      if (userSettings.edge_control_strength === undefined) {
        edgeStrength = 0.85;
      }
      if (userSettings.depth_control_strength === undefined) {
        depthStrength = 0.70;
      }
      if (steps === undefined) {
        steps = 35;
      }
      if (cfgScale === undefined) {
        cfgScale = 6.5;
      }
      console.log('[Denoise Debug] mode:', renderMode, 'denoise:', denoise, 'source: mode_clamp')
    } else {
      if (denoise === undefined || denoise === null) {
        denoise = 0.38;
      } else {
        denoise = Math.min(Math.max(Number(denoise), 0.15), 0.45);
      }
      if (userSettings.edge_control_strength === undefined) {
        edgeStrength = 0.90;
      }
      if (userSettings.depth_control_strength === undefined) {
        depthStrength = 0.75;
      }
      if (steps === undefined) {
        steps = 32;
      }
      if (cfgScale === undefined) {
        cfgScale = 6.5;
      }
      console.log('[Denoise Debug] mode:', renderMode, 'denoise:', denoise, 'source: mode_clamp')
    }

    finalSettings.render_mode = renderMode;
    finalSettings.geometryLockMode = renderMode;
    finalSettings.denoise = denoise;
    console.log('[Denoise Final]', finalSettings.denoise, 'memoryApplied:', memoryApplied, 'forceRegenerate:', forceRegenerate)
    finalSettings.denoise_strength = denoise;
    finalSettings.edge_control_strength = edgeStrength;
    finalSettings.depth_control_strength = depthStrength;
    finalSettings.steps = steps;
    finalSettings.cfg_scale = cfgScale;
    finalSettings.geometry_drift_score = null;
    finalSettings.structure_check_status = null;
    
    // Meta mappings to setting JSON
    finalSettings.materialMappings = analysisResult!.material_mappings;
    finalSettings.textureAnalysis = analysisResult!.texture_analysis;
    finalSettings.lightAnalysis = sceneType === 'Interior' ? analysisResult!.interior_light_analysis : analysisResult!.exterior_light_analysis;
    finalSettings.reflectionGuidance = analysisResult!.reflection_guidance;
    finalSettings.successCriteria = analysisResult!.success_criteria;

    // Apply any explicit technical overrides if present (just in case)
    if (userSettings.steps) finalSettings.steps = userSettings.steps;
    if (userSettings.cfg_scale) finalSettings.cfg_scale = userSettings.cfg_scale;
    if (userSettings.seed) finalSettings.seed = userSettings.seed;
    if (userSettings.upscale_factor !== undefined) finalSettings.upscale_factor = userSettings.upscale_factor;
    if (userSettings.upscale_denoise !== undefined) finalSettings.upscale_denoise = userSettings.upscale_denoise;

    // Log job parameters
    console.log(`[Gemini Enhancement] applied/skipped/failed status: ${geminiEnhancerStatus.status}${geminiEnhancerStatus.error ? ` (error: ${geminiEnhancerStatus.error})` : ''}`);
    console.log(`[Job Render Profile] Chosen profile: ${finalSettings.geometryLockMode}`);
    console.log(`[Job First Pass Settings] steps: ${finalSettings.steps}, cfg: ${finalSettings.cfg_scale}, denoise: ${finalSettings.denoise_strength}, canny strength: ${finalSettings.edge_control_strength}, depth strength: ${finalSettings.depth_control_strength}`);
    console.log(`[Job Second Pass Settings] upscale_factor: ${finalSettings.upscale_factor}, upscale_denoise: ${finalSettings.upscale_denoise}`);

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
    const newJob = await prisma.$transaction(async (tx: any) => {
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

      // Log Gemini prompt enhancement status
      await tx.jobEvent.create({
        data: {
          id: `event_${Date.now()}_${Math.floor(Math.random() * 1000 + 5)}`,
          jobId: jobId,
          eventType: `gemini_enhancement_${geminiEnhancerStatus.status}`,
          message: geminiEnhancerStatus.status === 'applied'
            ? 'Gemini prompt enhancement applied successfully.'
            : geminiEnhancerStatus.status === 'failed'
            ? `Gemini prompt enhancement failed: ${geminiEnhancerStatus.error || 'Unknown error'}. Fell back to original prompt.`
            : 'Gemini prompt enhancement skipped.',
          detailsJson: JSON.stringify({
            status: geminiEnhancerStatus.status,
            error: geminiEnhancerStatus.error || null,
            originalPrompt: finalPrompt,
            enhancedPrompt: enhancedPrompt
          })
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
  project: { projectType: string | null; sceneType: string | null; stylePreference: string | null },
  forceRegenerate?: boolean
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
    const matches = await prisma.preferenceMemory.findMany({
      where: {
        key: memoryKey,
        scope: { startsWith: scopePrefix },
      },
      orderBy: { score: 'desc' },
    });

    for (const match of matches) {
      const scopeLower = match.scope.toLowerCase();
      // Guard against cross-scene contamination (e.g. interior matching an exterior memory, or vice versa)
      if (sceneType === 'interior' && scopeLower.includes(':exterior')) {
        continue;
      }
      if (sceneType === 'exterior' && scopeLower.includes(':interior')) {
        continue;
      }

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
      if (memoryValue.denoise !== undefined && !forceRegenerate) renderSettings.denoise = memoryValue.denoise;
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
  promptModifier,
}: {
  projectType: string;
  sceneType: string;
  stylePromptTemplate: string;
  materialChoices: string[];
  memoryPrompt?: string;
  promptModifier?: string;
}) {
  let promptParts: string[] = [];

  // 1. Scene context & project type as primary attention weight
  const context = `architectural visualization of a ${projectType.toLowerCase()} ${sceneType.toLowerCase()}`;
  promptParts.push(context);

  // 2. Add style base template
  promptParts.push(stylePromptTemplate);

  // 3. Add material choices highlight tags
  if (materialChoices && materialChoices.length > 0) {
    const materialsStr = materialChoices.map((m: any) => m.toLowerCase()).join(', ');
    promptParts.push(`with material highlights of ${materialsStr}`);
  }

  // 4. Memory additions if applicable
  if (memoryPrompt && memoryPrompt !== stylePromptTemplate) {
    // Only append if it's different to avoid duplicate prompt segments
    promptParts.push(`fine-tuned details: ${memoryPrompt}`);
  }

  // 5. Custom prompt revision modifiers
  if (promptModifier && promptModifier.trim() !== '') {
    promptParts.push(promptModifier.trim());
  }

  return promptParts
    .map((part: any) => part.trim())
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
