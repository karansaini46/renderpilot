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
  memoryPrompt?: string;
}

export interface PromptComposerOutput {
  positivePrompt: string;
  negativePrompt: string;
  renderMode: RenderMode;
  denoise: number;
  geometryLockMode: GeometryLockMode;
  promptSafetyReport?: {
    removedTerms: {
      term: string;
      source: 'preset' | 'modifier' | 'memory' | 'gemini_draft' | 'unknown';
    }[];
  };
  promptDebugParts: {
    sceneFacts: string;
    preserveConstraints: string;
    criticalObjects: string;
    materialsAndSurfaces: string;
    lightingAndReflections: string;
    styleTerms: string;
    geminiDraftSanitized: string;
    userModifier: string;
    memoryPrompt: string;
  };
}

function isTermVisibleInAnalysis(term: string, analysis: PromptBrainSchema): boolean {
  const termLower = term.toLowerCase().trim();
  
  if (analysis.major_objects?.some(o => o.name.toLowerCase().includes(termLower) || o.category.toLowerCase().includes(termLower))) {
    return true;
  }
  
  if (analysis.object_priority?.some(op => op.objectName.toLowerCase().includes(termLower))) {
    return true;
  }
  
  if (analysis.materials?.some(m => m.toLowerCase().includes(termLower))) {
    return true;
  }

  if (analysis.material_mappings?.some(m => m.objectName.toLowerCase().includes(termLower) || m.suggestedMaterial.toLowerCase().includes(termLower))) {
    return true;
  }

  if (analysis.user_summary?.toLowerCase().includes(termLower)) {
    return true;
  }

  if (analysis.camera_view?.description?.toLowerCase().includes(termLower)) {
    return true;
  }

  return false;
}

export function composePrompt(input: PromptComposerInput): PromptComposerOutput {
  const { analysis, stylePreset, renderMode, promptModifier, memoryPrompt } = input;

  const sceneType = analysis.scene_type || 'Exterior';
  const geometryLockMode = renderMode || analysis.suggested_geometry_lock || stylePreset.defaultGeometryLockMode || 'strict_structure';
  const isCreative = geometryLockMode.toLowerCase() === 'creative' || geometryLockMode.toLowerCase() === 'creative_concept';

  // Determine if it is a bedroom job
  const isBedroom = analysis.room_type_protection?.roomType?.toLowerCase() === 'bedroom' ||
                    analysis.user_summary?.toLowerCase().includes('bedroom') ||
                    analysis.positive_prompt_draft?.toLowerCase().includes('bedroom') ||
                    promptModifier?.toLowerCase().includes('bedroom') ||
                    memoryPrompt?.toLowerCase().includes('bedroom');

  // Gather scene-aware blocked terms
  const activeBlockedTerms: string[] = [];

  // 1. Bedroom faithful/balanced jobs
  if (isBedroom && !isCreative) {
    const bedroomCandidates = ['living room', 'sofa', 'fireplace', 'exterior', 'facade', 'garden windows', 'pool', 'villa', 'driveway'];
    for (const term of bedroomCandidates) {
      if (!isTermVisibleInAnalysis(term, analysis)) {
        activeBlockedTerms.push(term);
      }
    }
  }

  // 2. Interior jobs
  if (sceneType === 'Interior' && !isCreative) {
    const interiorCandidates = ['exterior', 'facade', 'garden', 'pool', 'villa', 'driveway', 'landscape', 'clouds', 'starry night', 'sky', 'lawn', 'patio', 'deck', 'street'];
    for (const term of interiorCandidates) {
      if (!isTermVisibleInAnalysis(term, analysis)) {
        activeBlockedTerms.push(term);
      }
    }
  }

  // 3. Exterior jobs
  if (sceneType === 'Exterior') {
    const exteriorCandidates = ['bed', 'bedroom', 'living room', 'sofa', 'fireplace', 'kitchen', 'bathroom', 'interior', 'indoor', 'dining room', 'couch', 'furniture', 'ceilings', 'paneling', 'carpet', 'rug', 'curtain', 'chandelier'];
    for (const term of exteriorCandidates) {
      if (!isTermVisibleInAnalysis(term, analysis)) {
        activeBlockedTerms.push(term);
      }
    }
  }

  // 4. Style preset specific blocked terms
  if (stylePreset.blockedTerms) {
    for (const term of stylePreset.blockedTerms) {
      activeBlockedTerms.push(term);
    }
  }

  const finalBlockedTerms = Array.from(new Set(activeBlockedTerms));

  const removedTerms: {
    term: string;
    source: 'preset' | 'modifier' | 'memory' | 'gemini_draft' | 'unknown';
  }[] = [];

  // Helper to sanitize and report removed terms
  const sanitizeAndReport = (
    prompt: string,
    source: 'preset' | 'modifier' | 'memory' | 'gemini_draft' | 'unknown'
  ): string => {
    if (!prompt || prompt.trim() === '') return '';
    
    return prompt
      .split(',')
      .map(term => term.trim())
      .filter(term => {
        if (!term) return false;
        const lower = term.toLowerCase();
        
        // Find if this term contains any of the blocked words
        const matched = finalBlockedTerms.find(blocked => 
          lower.includes(blocked.toLowerCase())
        );
        
        if (matched) {
          removedTerms.push({
            term: term,
            source: source
          });
          return false;
        }
        return true;
      })
      .join(', ');
  };

  // 2. Rule 1: Source scene facts first
  const sceneFactsRaw = [
    `architectural visualization of a ${sceneType.toLowerCase()}`,
    analysis.camera_view?.description,
    analysis.major_objects?.length > 0
      ? `featuring ${analysis.major_objects.map(o => o.name.toLowerCase()).join(', ')}`
      : ''
  ].filter(Boolean).join(', ');

  const sceneFacts = sanitizeAndReport(sceneFactsRaw, 'unknown');

  const preserveConstraintsRaw = analysis.preserve_constraints && analysis.preserve_constraints.length > 0
    ? `preserve structural constraints: ${analysis.preserve_constraints.join(', ')}`
    : '';

  const preserveConstraints = sanitizeAndReport(preserveConstraintsRaw, 'unknown');

  // Strict structure positive terms injection
  let strictStructurePositive = '';
  if (geometryLockMode === 'strict_structure') {
    const strictPositiveTerms = [
      'premium photorealistic architectural visualization',
      'realistic exterior materials',
      'white smooth plaster walls',
      'realistic glass balcony railing with reflections',
      'natural wooden gate and facade panels',
      'aluminum window frames',
      'concrete slab edges',
      'sharp architectural lines',
      'realistic daylight',
      'sun-cast shadows',
      'ambient occlusion',
      'global illumination',
      'contact shadows',
      'ultra-detailed textures',
      'professional archviz render'
    ];
    strictStructurePositive = sanitizeAndReport(strictPositiveTerms.join(', '), 'unknown');
  }

  // 4. Rule 3: Critical objects from object_priority must be included
  const priorityObjectsList = analysis.object_priority
    ? analysis.object_priority
        .filter(o => o.priority === 'high' || o.priority === 'medium')
        .map(o => o.objectName.toLowerCase())
    : [];

  const criticalObjectsRaw = priorityObjectsList.length > 0
    ? `critical elements: ${priorityObjectsList.join(', ')}`
    : '';

  const criticalObjects = sanitizeAndReport(criticalObjectsRaw, 'unknown');

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
  const materialsAndSurfaces = sanitizeAndReport(materialsAndSurfacesRaw, 'unknown');

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
  const lightingAndReflections = sanitizeAndReport(lightingAndReflectionsRaw, 'unknown');

  // 8. Rule 8: Style preset safe style terms
  const styleTermsRaw = stylePreset.safeStyleTerms && stylePreset.safeStyleTerms.length > 0
    ? stylePreset.safeStyleTerms.join(', ')
    : stylePreset.promptTemplate;

  const styleTerms = sanitizeAndReport(styleTermsRaw, 'preset');

  // 9. Secondary input: Sanitized Gemini positive_prompt_draft
  const geminiDraftSanitized = sanitizeAndReport(analysis.positive_prompt_draft || '', 'gemini_draft');

  // 10. Optional User modifier
  const userModifier = sanitizeAndReport(promptModifier || '', 'modifier');

  // 11. Memory prompt
  const memoryPromptSanitized = sanitizeAndReport(memoryPrompt || '', 'memory');

  // 12. Compose positive prompt (maintaining strict facts-first ordering)
  const positivePrompt = [
    sceneFacts,
    preserveConstraints,
    strictStructurePositive,
    criticalObjects,
    materialsAndSurfaces,
    lightingAndReflections,
    styleTerms,
    geminiDraftSanitized,
    memoryPromptSanitized,
    userModifier
  ]
    .map(p => p.trim())
    .filter(Boolean)
    .join(', ');

  // 13. Rule 10: Compile Negative prompt
  const defaultNegativeTerms = [
    'room conversion', 'change of room function', 'bedroom to living room',
    'object replacement', 'substitute furniture', 'fake reflections',
    'over-reflective glass', 'opaque glass', 'distorted mirror', 'missing mirror',
    'layout change', 'camera shift', 'low quality', 'text', 'watermark'
  ];

  const strictStructureNegativeTerms = geometryLockMode === 'strict_structure'
    ? [
        'warped architecture',
        'changed facade',
        'distorted building',
        'crooked walls',
        'bent balcony',
        'extra windows',
        'missing windows',
        'deformed railings',
        'changed gate',
        'bad human',
        'distorted person',
        'blurry',
        'cartoon',
        'sketch',
        'painting',
        'plastic texture',
        'low detail',
        'oversmoothed',
        'unrealistic lighting'
      ]
    : [];

  const presetNegative = stylePreset.negativePrompt || '';
  const forbiddenChanges = analysis.forbidden_changes || [];

  const negativePrompt = [
    presetNegative,
    forbiddenChanges.join(', '),
    finalBlockedTerms.join(', '),
    defaultNegativeTerms.join(', '),
    strictStructureNegativeTerms.join(', ')
  ]
    .map(p => p.trim())
    .filter(Boolean)
    .join(', ');

  // 14. Determine fallback settings
  const finalRenderMode = renderMode || analysis.suggested_render_mode || 'img2img';
  
  let defaultDenoise = stylePreset.defaultSettings?.denoise ?? 0.65;
  if (geometryLockMode === 'strict_structure') {
    defaultDenoise = 0.25;
  } else if (geometryLockMode === 'balanced_enhancement') {
    defaultDenoise = 0.40;
  } else if (geometryLockMode === 'creative_concept') {
    defaultDenoise = 0.65;
  }

  const denoise = typeof analysis.suggested_denoise === 'number'
    ? analysis.suggested_denoise
    : defaultDenoise;

  const finalGeometryLockMode = finalRenderMode === 'base_render_model' ? 'balanced' : (geometryLockMode as GeometryLockMode);

  return {
    positivePrompt,
    negativePrompt,
    renderMode: finalRenderMode,
    denoise,
    geometryLockMode: finalGeometryLockMode,
    promptSafetyReport: {
      removedTerms: removedTerms
    },
    promptDebugParts: {
      sceneFacts,
      preserveConstraints,
      criticalObjects,
      materialsAndSurfaces,
      lightingAndReflections,
      styleTerms,
      geminiDraftSanitized,
      userModifier,
      memoryPrompt: memoryPromptSanitized
    }
  };
}
