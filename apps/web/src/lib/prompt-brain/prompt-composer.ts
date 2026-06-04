import { env } from '../../config/env';
import { StylePreset } from '../style-presets';
import {
  PromptBrainSchema,
  SceneType,
  RenderMode,
  GeometryLockMode,
  CameraView,
  MajorObject,
  ObjectPriority,
  CompositionLock,
  MaterialMappingSuggestion,
  TextureAnalysis,
  SurfaceBehavior,
  InteriorLightAnalysis,
  ExteriorLightAnalysis,
  MirrorAnalysis,
  GlassAnalysis,
  ReflectionGuidance,
  RoomTypeProtection,
  GeometryRisk,
  StyleSafety,
  InputQuality,
  WorkflowRecommendation,
  DetailEnhancementPlan,
} from './types';

export interface PromptComposerInput {
  analysis: PromptBrainSchema;
  stylePreset: StylePreset;
  renderMode?: RenderMode;
  promptModifier?: string;
  manualCorrections?: Record<string, any>;
}

export interface PromptComposerOutput {
  positivePrompt: string;
  negativePrompt: string;
  renderMode: RenderMode;
  denoise: number;
  geometryLockMode: GeometryLockMode;
  promptDebugParts: {
    sceneFacts: string;
    preserveConstraints: string;
    criticalObjects: string;
    materialsAndSurfaces: string;
    lightingAndReflections: string;
    styleTerms: string;
    geminiDraftSanitized: string;
    userModifier: string;
  };
}

function sanitizePromptString(prompt: string, blockedTerms: string[]): string {
  if (!prompt || prompt.trim() === '') return '';
  
  return prompt
    .split(',')
    .map(term => term.trim())
    .filter(term => {
      if (!term) return false;
      const lower = term.toLowerCase();
      // Keep term if none of the blocked words is present in the term
      return !blockedTerms.some(blocked => lower.includes(blocked.toLowerCase()));
    })
    .join(', ');
}

export function composePrompt(input: PromptComposerInput): PromptComposerOutput {
  const { analysis, stylePreset, renderMode, promptModifier } = input;

  const sceneType = analysis.scene_type || 'Exterior';

  // 1. Gather blocked terms based on scene type and preset configuration
  const presetBlocked = stylePreset.blockedTerms || [];
  const defaultBlocked = sceneType.toLowerCase() === 'interior'
    ? ['pool', 'garden', 'driveway', 'villa', 'facade', 'exterior', 'landscape', 'clouds', 'starry night']
    : ['sofa', 'fireplace', 'bed', 'living room', 'bedroom', 'bathroom', 'kitchen', 'interior'];

  // Combined unique set of blocked terms
  const blockedTerms = Array.from(new Set([...presetBlocked, ...defaultBlocked]));

  // 2. Rule 1: Source scene facts first
  const sceneFactsRaw = [
    `architectural visualization of a ${sceneType.toLowerCase()}`,
    analysis.camera_view?.description,
    analysis.major_objects?.length > 0
      ? `featuring ${analysis.major_objects.map(o => o.name.toLowerCase()).join(', ')}`
      : ''
  ].filter(Boolean).join(', ');

  const sceneFacts = sanitizePromptString(sceneFactsRaw, blockedTerms);

  // 3. Rule 2: Preserve constraints must be explicit
  const preserveConstraintsRaw = analysis.preserve_constraints && analysis.preserve_constraints.length > 0
    ? `preserve structural constraints: ${analysis.preserve_constraints.join(', ')}`
    : '';

  const preserveConstraints = sanitizePromptString(preserveConstraintsRaw, blockedTerms);

  // 4. Rule 3: Critical objects from object_priority must be included
  const priorityObjectsList = analysis.object_priority
    ? analysis.object_priority
        .filter(o => o.priority === 'high' || o.priority === 'medium')
        .map(o => o.objectName.toLowerCase())
    : [];

  const criticalObjectsRaw = priorityObjectsList.length > 0
    ? `critical elements: ${priorityObjectsList.join(', ')}`
    : '';

  const criticalObjects = sanitizePromptString(criticalObjectsRaw, blockedTerms);

  // 5. Rule 4: Materials, textures, and surface behavior (above confidence threshold)
  const minConfidence = env.PROMPT_BRAIN_MIN_CONFIDENCE || 0.75;
  const highConfMaterialsList = analysis.material_mappings
    ? analysis.material_mappings
        .filter(m => m.confidence >= minConfidence)
        .map(m => `${m.suggestedMaterial} ${m.objectName}`)
    : [];

  const materialsText = highConfMaterialsList.length > 0
    ? `materials: ${highConfMaterialsList.join(', ')}`
    : '';

  const surfaceText = analysis.surface_behavior?.details
    ? `surface behavior: ${analysis.surface_behavior.details}, glossiness: ${analysis.surface_behavior.glossiness}, roughness: ${analysis.surface_behavior.roughness}`
    : '';

  const materialsAndSurfacesRaw = [materialsText, surfaceText].filter(Boolean).join(', ');
  const materialsAndSurfaces = sanitizePromptString(materialsAndSurfacesRaw, blockedTerms);

  // 6. Rule 5 & 6: Lighting (interior vs exterior checks)
  let lightingRaw = '';
  if (sceneType === 'Interior') {
    if (analysis.interior_light_analysis) {
      lightingRaw = `interior lighting: ${analysis.interior_light_analysis.description || 'soft ambient lighting'}, light sources: ${(analysis.interior_light_analysis.lightSources || []).join(', ')}`;
    }
  } else {
    if (analysis.exterior_light_analysis) {
      lightingRaw = `exterior lighting: ${analysis.exterior_light_analysis.description || 'natural daylight'}, sun position: ${analysis.exterior_light_analysis.sunPosition || 'clear sky'}`;
    }
  }

  // 7. Rule 7: Mirror/glass/reflection guidance
  const reflectionParts: string[] = [];
  if (analysis.mirror_analysis?.detected) {
    reflectionParts.push(`mirror surface reflection: ${analysis.mirror_analysis.description}`);
  }
  if (analysis.glass_analysis?.detected) {
    reflectionParts.push(`glass properties: ${analysis.glass_analysis.description}`);
  }
  if (analysis.reflection_guidance?.promptTriggers && analysis.reflection_guidance.promptTriggers.length > 0) {
    reflectionParts.push(`reflections: ${analysis.reflection_guidance.promptTriggers.join(', ')}`);
  }

  const reflectionsRaw = reflectionParts.join(', ');
  const lightingAndReflectionsRaw = [lightingRaw, reflectionsRaw].filter(Boolean).join(', ');
  const lightingAndReflections = sanitizePromptString(lightingAndReflectionsRaw, blockedTerms);

  // 8. Rule 8: Style preset safe style terms
  const styleTermsRaw = stylePreset.safeStyleTerms && stylePreset.safeStyleTerms.length > 0
    ? stylePreset.safeStyleTerms.join(', ')
    : stylePreset.promptTemplate;

  const styleTerms = sanitizePromptString(styleTermsRaw, blockedTerms);

  // 9. Secondary input: Sanitized Gemini positive_prompt_draft
  const geminiDraftSanitized = analysis.positive_prompt_draft
    ? sanitizePromptString(analysis.positive_prompt_draft, blockedTerms)
    : '';

  // 10. Optional User modifier
  const userModifier = promptModifier ? sanitizePromptString(promptModifier, blockedTerms) : '';

  // 11. Compose positive prompt (maintaining strict facts-first ordering)
  const positivePrompt = [
    sceneFacts,
    preserveConstraints,
    criticalObjects,
    materialsAndSurfaces,
    lightingAndReflections,
    styleTerms,
    geminiDraftSanitized,
    userModifier
  ]
    .map(p => p.trim())
    .filter(Boolean)
    .join(', ');

  // 12. Rule 10: Compile Negative prompt
  const defaultNegativeTerms = [
    'room conversion', 'change of room function', 'bedroom to living room',
    'object replacement', 'substitute furniture', 'fake reflections',
    'over-reflective glass', 'opaque glass', 'distorted mirror', 'missing mirror',
    'layout change', 'camera shift', 'low quality', 'text', 'watermark'
  ];

  const presetNegative = stylePreset.negativePrompt || '';
  const forbiddenChanges = analysis.forbidden_changes || [];

  const negativePrompt = [
    presetNegative,
    forbiddenChanges.join(', '),
    blockedTerms.join(', '),
    defaultNegativeTerms.join(', ')
  ]
    .map(p => p.trim())
    .filter(Boolean)
    .join(', ');

  // 13. Determine fallback settings
  const finalRenderMode = renderMode || analysis.suggested_render_mode || 'img2img';
  const denoise = typeof analysis.suggested_denoise === 'number'
    ? analysis.suggested_denoise
    : (stylePreset.defaultSettings?.denoise ?? 0.65);

  const geometryLockMode = analysis.suggested_geometry_lock || stylePreset.defaultGeometryLockMode || 'balanced';

  return {
    positivePrompt,
    negativePrompt,
    renderMode: finalRenderMode,
    denoise,
    geometryLockMode,
    promptDebugParts: {
      sceneFacts,
      preserveConstraints,
      criticalObjects,
      materialsAndSurfaces,
      lightingAndReflections,
      styleTerms,
      geminiDraftSanitized,
      userModifier
    }
  };
}
