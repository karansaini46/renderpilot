import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST: Persists or updates evaluation feedback and quality ratings for a specific render variation.
 * Uses atomic upsert to ensure only one feedback record is stored per render.
 *
 * When approved, updates the preference_memory table with the render's successful settings
 * so future jobs of the same type can reuse them automatically.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: renderId } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { approved, rating, scores, action, rejectionReasons, notes, clientName, reason, requestedChange } = body;

    if (approved === undefined) {
      return NextResponse.json(
        { error: "Missing required parameter: 'approved' is required" },
        { status: 400 }
      );
    }

    // 1. Verify that target render actually exists in the Neon DB
    const render = await prisma.render.findUnique({
      where: { id: renderId },
      include: {
        project: {
          select: {
            projectType: true,
            sceneType: true,
            stylePreference: true,
          }
        }
      }
    });

    if (!render) {
      return NextResponse.json(
        { error: 'Render record not found' },
        { status: 404 }
      );
    }

    // 2. Pack sub-category ratings and action items in JSON
    const feedbackId = `feedback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const scoresJson = JSON.stringify({
      scores: scores || {},
      action: action || '',
      rejectionReasons: rejectionReasons || []
    });

    // 3. Atomically create or update the feedback row
    const feedback = await prisma.renderFeedback.upsert({
      where: { renderId: renderId },
      update: {
        approved: !!approved,
        rating: rating !== undefined ? Number(rating) : null,
        scoresJson,
        notes: notes || '',
      },
      create: {
        id: feedbackId,
        renderId: renderId,
        approved: !!approved,
        rating: rating !== undefined ? Number(rating) : null,
        scoresJson,
        notes: notes || '',
      }
    });

    // 4. When approved, update preference memory with successful settings
    if (approved && render.project) {
      try {
        await upsertPreferenceMemory(render, rating, scores);
      } catch (memoryErr: any) {
        // Memory update is non-blocking — log but don't fail the request
        console.error('[Preference Memory Update Error]:', memoryErr.message);
      }
    }

    // 4b. When rejected or edited, save revision notes
    if (!approved || (action && action !== 'none') || requestedChange || (rejectionReasons && rejectionReasons.length > 0)) {
      try {
        const computedReason = reason || (rejectionReasons || []).join(', ') || notes || 'Revision requested';
        const computedChange = requestedChange || (action && action !== 'none' ? action : '') || 'Modify output details';
        const finalClientName = clientName || null;

        // If client name is provided, update the project's clientName
        if (finalClientName && render.projectId) {
          await prisma.project.update({
            where: { id: render.projectId },
            data: { clientName: finalClientName }
          });
        }

        const styleName = render.styleId || '';

        await prisma.revisionNote.create({
          data: {
            id: `rev_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            projectId: render.projectId,
            clientName: finalClientName,
            reason: computedReason,
            requestedChange: computedChange,
            style: styleName,
            settingsJson: render.settingsJson || '{}'
          }
        });
      } catch (revErr: any) {
        console.error('[Revision Note Creation Error]:', revErr.message);
      }
    }

    // 5. Training sample candidates: add if approved with sufficient score, remove if rejected
    if (approved && rating !== undefined && Number(rating) >= 4) {
      try {
        await createTrainingSampleCandidate(render, Number(rating));
      } catch (trainErr: any) {
        console.error('[Training Sample Candidate Creation Error]:', trainErr.message);
      }
    } else if (!approved) {
      try {
        await prisma.trainingSample.deleteMany({
          where: { renderId: render.id }
        });
      } catch (err: any) {
        console.error('[Training Sample Delete Error]:', err.message);
      }
    }

    return NextResponse.json(feedback, { status: 200 });

  } catch (error: any) {
    console.error('[Render Feedback POST Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error saving render feedback' },
      { status: 500 }
    );
  }
}

/**
 * Upserts a preference_memory row keyed by the render's project type, scene type,
 * and style preference. Tracks success count and rolling average score so future
 * jobs can reuse proven settings without any model training.
 */
async function upsertPreferenceMemory(
  render: any,
  rating: number | undefined,
  scores: Record<string, number> | undefined
) {
  const project = render.project;
  const projectType = (project.projectType || 'general').toLowerCase().trim();
  const sceneType = (project.sceneType || 'general').toLowerCase().trim();
  const stylePref = (project.stylePreference || 'default').toLowerCase().trim();

  // Composite scope key for matching: project_type:scene_type:style
  const scope = `${projectType}:${sceneType}:${stylePref}`;
  const memoryKey = 'render_settings';

  // Parse the render's stored settings
  let renderSettings: Record<string, any> = {};
  try {
    renderSettings = JSON.parse(render.settingsJson || '{}');
  } catch {
    renderSettings = {};
  }

  const numericRating = rating !== undefined ? Number(rating) : 3;

  // Build the settings payload to store in memory
  const settingsPayload: Record<string, any> = {
    prompt: render.prompt || '',
    negative_prompt: render.negativePrompt || '',
    seed: render.seed ? Number(render.seed) : null,
    steps: renderSettings.steps || 20,
    cfg_scale: renderSettings.cfg_scale || 7.0,
    denoise: renderSettings.denoise || 0.65,
    style_id: render.styleId || null,
    geometry_lock_mode: scores?.geometry !== undefined && scores.geometry >= 4 ? 'locked' : 'flexible',
    material_choices: renderSettings.materialChoices || [],
    scores: scores || {},
  };

  // Check if an existing memory row exists for this scope
  const existing = await prisma.preferenceMemory.findFirst({
    where: { scope, key: memoryKey }
  });

  if (existing) {
    // Update existing memory: rolling average score and increment success count
    let existingValue: Record<string, any> = {};
    try {
      existingValue = JSON.parse(existing.valueJson || '{}');
    } catch {
      existingValue = {};
    }

    const prevCount = existingValue.success_count || 0;
    const prevAvg = existing.score || 0;
    const newCount = prevCount + 1;
    const newAvgScore = ((prevAvg * prevCount) + numericRating) / newCount;

    const updatedValue = {
      ...settingsPayload,
      success_count: newCount,
      average_score: Math.round(newAvgScore * 100) / 100,
    };

    await prisma.preferenceMemory.update({
      where: { id: existing.id },
      data: {
        valueJson: JSON.stringify(updatedValue),
        score: Math.round(newAvgScore * 100) / 100,
        sourceRenderId: render.id,
      }
    });
  } else {
    // Create new memory row
    const memoryId = `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const newValue = {
      ...settingsPayload,
      success_count: 1,
      average_score: numericRating,
    };

    await prisma.preferenceMemory.create({
      data: {
        id: memoryId,
        scope,
        key: memoryKey,
        valueJson: JSON.stringify(newValue),
        score: numericRating,
        sourceRenderId: render.id,
      }
    });
  }
}

/**
 * Creates a training_samples row when a render is approved with a high rating (>= 4 stars).
 */
async function createTrainingSampleCandidate(render: any, rating: number) {
  // Determine styleId
  let targetStyleId = render.styleId;
  
  if (!targetStyleId) {
    // Attempt to match project style preference to a seeded style
    const stylePref = render.project?.stylePreference || '';
    const style = await prisma.style.findFirst({
      where: {
        name: {
          contains: stylePref,
          mode: 'insensitive'
        }
      }
    });
    if (style) {
      targetStyleId = style.id;
    } else {
      // Use fallback seeded style if none found
      targetStyleId = 'style_mod_lux_ext';
    }
  }

  // Ensure that the Style row exists in DB before inserting relation
  const styleExists = await prisma.style.findUnique({
    where: { id: targetStyleId }
  });
  if (!styleExists) {
    // Fallback to first active style or style_mod_lux_ext if target style is not found in DB
    const firstStyle = await prisma.style.findFirst({ where: { active: true } });
    targetStyleId = firstStyle?.id || 'style_mod_lux_ext';
  }

  // Generate placeholder caption
  // Format the style name cleanly from the style ID
  const styleCleanName = targetStyleId.replace('style_', '').replace(/_/g, ' ');
  const cleanSceneType = render.project?.sceneType || 'space';
  const captionPlaceholder = `A high-quality architectural rendering of a ${cleanSceneType} in ${styleCleanName} style.`;

  // Upsert to avoid duplicate candidates for the same render
  const sampleId = `ts_${render.id}`;
  
  await prisma.trainingSample.upsert({
    where: { id: sampleId },
    update: {
      qualityScore: rating,
      sceneType: render.project?.sceneType || 'general',
      imageUrl: render.finalImageUrl,
    },
    create: {
      id: sampleId,
      renderId: render.id,
      styleId: targetStyleId,
      imageUrl: render.finalImageUrl,
      caption: captionPlaceholder,
      qualityScore: rating,
      sceneType: render.project?.sceneType || 'general',
      datasetSplit: 'train',
      approvedForTraining: false,
    }
  });
}

