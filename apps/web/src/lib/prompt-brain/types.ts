/**
 * Domain constants and TypeScript types for RenderPilot's PromptBrain schema.
 */

// 1. Safe domain constants

export const SCENE_TYPES = ['Exterior', 'Interior', 'Aerial Studio', 'Macro Detail'] as const;
export type SceneType = typeof SCENE_TYPES[number];

export const RENDER_MODES = ['base_render_model', 'img2img', 'upscale_selected'] as const;
export type RenderMode = typeof RENDER_MODES[number];

export const GEOMETRY_LOCK_MODES = ['creative', 'balanced', 'accurate', 'technical', 'strict_structure', 'balanced_enhancement', 'creative_concept'] as const;
export type GeometryLockMode = typeof GEOMETRY_LOCK_MODES[number];

export const VALID_MATERIAL_CATEGORIES = [
  'wall', 'floor', 'ceiling', 'glass', 'frame', 'wood', 
  'stone', 'concrete', 'metal', 'vegetation', 'furniture', 'sky',
  'roof', 'door'
] as const;
export type MaterialCategory = typeof VALID_MATERIAL_CATEGORIES[number];

// 2. Schema field interfaces

export interface CameraView {
  angle: string;
  elevation: string;
  focalLength?: string;
  description: string;
}

export interface MajorObject {
  name: string;
  category: string;
  description?: string;
}

export interface ObjectPriority {
  objectName: string;
  priority: 'low' | 'medium' | 'high';
  reason: string;
}

export interface CompositionLock {
  description: string;
  lockAspects: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface MaterialMappingSuggestion {
  objectName: string;
  category: MaterialCategory;
  suggestedMaterial: string;
  confidence: number;
}

export interface TextureAnalysis {
  description: string;
  dominantPatterns: string[];
}

export interface SurfaceBehavior {
  glossiness: string;
  roughness: string;
  metallic: string;
  details: string;
}

export interface InteriorLightAnalysis {
  lightSources: string[];
  dominantColorTemp: string;
  intensity: 'low' | 'medium' | 'high';
  description: string;
}

export interface ExteriorLightAnalysis {
  sunPosition: string;
  timeOfDay: string;
  weatherCondition: string;
  shadowSharpness: string;
  description: string;
}

export interface MirrorAnalysis {
  detected: boolean;
  count: number;
  surfaceAreaEstimated: string;
  description: string;
}

export interface GlassAnalysis {
  detected: boolean;
  transparencyLevel: string;
  reflectionLevel: string;
  description: string;
}

export interface ReflectionGuidance {
  promptTriggers: string[];
  renderSettingsAdjustment: string;
}

export interface RoomTypeProtection {
  roomType: string;
  protectedElements: string[];
  forbiddenSubstitutions: string[];
}

export interface GeometryRisk {
  element: string;
  riskType: string;
  mitigation: string;
}

export interface StyleSafety {
  styleIncompatibilities: string[];
  promptSafetyFlags: string[];
}

export interface InputQuality {
  resolutionCheck: string;
  compressionArtifacts: boolean;
  blurriness: 'none' | 'low' | 'medium' | 'high';
  score: number;
}

export interface WorkflowRecommendation {
  pipeline: string;
  steps: string[];
  reason: string;
}

export interface DetailEnhancementPlan {
  steps: string[];
  targetAreas: string[];
}

// 3. Root PromptBrain Schema definition

export interface PromptBrainSchema {
  scene_type: SceneType;
  confidence: number;
  camera_view: CameraView;
  major_objects: MajorObject[];
  object_priority: ObjectPriority[];
  composition_lock: CompositionLock;
  materials: string[];
  material_mappings: MaterialMappingSuggestion[];
  texture_analysis: TextureAnalysis;
  surface_behavior: SurfaceBehavior;
  interior_light_analysis: InteriorLightAnalysis;
  exterior_light_analysis: ExteriorLightAnalysis;
  mirror_analysis: MirrorAnalysis;
  glass_analysis: GlassAnalysis;
  reflection_guidance: ReflectionGuidance;
  room_type_protection: RoomTypeProtection;
  geometry_risks: GeometryRisk[];
  style_safety: StyleSafety;
  input_quality: InputQuality;
  workflow_recommendation: WorkflowRecommendation;
  preserve_constraints: string[];
  forbidden_changes: string[];
  detail_enhancement_plan: DetailEnhancementPlan;
  suggested_render_mode: RenderMode;
  suggested_denoise: number;
  suggested_geometry_lock: GeometryLockMode;
  positive_prompt_draft: string;
  negative_prompt_draft: string;
  risk_flags: string[];
  success_criteria: string[];
  user_summary: string;
}
