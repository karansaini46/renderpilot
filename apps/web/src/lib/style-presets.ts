export interface StylePreset {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;
  negativePrompt: string;
  defaultGeometryLockMode: 'creative' | 'balanced' | 'accurate' | 'technical' | 'strict_structure' | 'balanced_enhancement' | 'creative_concept';
  defaultSettings: {
    steps: number;
    cfg_scale: number;
    denoise: number;
    guidance_strength?: number;
  };
  allowedSceneTypes?: string[];
  blockedTerms?: string[];
  safeStyleTerms?: string[];
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'style_mod_lux_ext',
    name: 'Modern Luxury Exterior',
    description: 'Clean concrete, warm sunset reflections, premium facade finish, architectural digest style.',
    promptTemplate: 'modern luxury architectural style, raw concrete surfaces, warm glowing accent lighting, twilight sunset sky, architectural photography, premium render quality',
    negativePrompt: 'deformed, blurry, low quality, sketch, drawing, lowres, text, watermark, logo, bad lighting',
    defaultGeometryLockMode: 'balanced',
    defaultSettings: { steps: 30, cfg_scale: 7.5, denoise: 0.65 },
    allowedSceneTypes: ['Exterior', 'Aerial Studio'],
    blockedTerms: ['pool', 'garden', 'fireplace', 'sofa', 'balconies', 'villa', 'interior', 'room'],
    safeStyleTerms: ['concrete', 'twilight', 'accent lighting', 'facade']
  },
  {
    id: 'style_warm_int',
    name: 'Warm Interior',
    description: 'Warm ambient lighting, premium wood and travertine textures, soft shadows.',
    promptTemplate: 'warm ambient lighting, premium material finish, realistic wood texture, refined stone accents, soft shadows, clean architectural detailing, high-end photorealistic interior render quality',
    negativePrompt: 'deformed, low quality, dark shadows, noisy, text, watermark, bad framing, drawing, illustration',
    defaultGeometryLockMode: 'balanced',
    defaultSettings: { steps: 28, cfg_scale: 7.0, denoise: 0.65 },
    allowedSceneTypes: ['Interior', 'Macro Detail'],
    blockedTerms: ['fireplace', 'sofa', 'garden', 'windows', 'balconies', 'exterior', 'landscape', 'villa', 'pool'],
    safeStyleTerms: ['warm ambient lighting', 'premium material finish', 'realistic wood texture', 'refined stone accents']
  },
  {
    id: 'style_min_white',
    name: 'Minimal White',
    description: 'Geometric lines, sharp shadow play, conceptual architectural white-model aesthetics.',
    promptTemplate: 'conceptual architectural model style, minimalist white matte surfaces, clean sharp shadows, geometric grid lines, studio lighting background, pure white and soft grey tones, sharp contours, wireframe details',
    negativePrompt: 'textures, complex colors, realistic landscape, busy background, text, watermark, low quality, dark',
    defaultGeometryLockMode: 'technical',
    defaultSettings: { steps: 20, cfg_scale: 6.5, denoise: 0.50 },
    blockedTerms: ['fireplace', 'sofa', 'garden', 'pool', 'villa', 'facade', 'exterior', 'interior'],
    safeStyleTerms: ['minimalist', 'white matte', 'sharp shadows', 'geometric grid']
  },
  {
    id: 'style_trop_villa',
    name: 'Tropical Villa',
    description: 'Warm timber posts, bamboo accents, textured stone pathways, cinematic daylight resort vibe.',
    promptTemplate: 'tropical architectural style, warm timber accents, detailed bamboo textures, sunny daylight, cinematic volumetric fog, resort atmosphere',
    negativePrompt: 'snow, winter, dry landscape, city buildings, deformed, lowres, blurry, text, logo, dark lighting',
    defaultGeometryLockMode: 'balanced',
    defaultSettings: { steps: 30, cfg_scale: 8.0, denoise: 0.70 },
    allowedSceneTypes: ['Exterior', 'Aerial Studio'],
    blockedTerms: ['villa', 'pool', 'sofa', 'fireplace', 'garden', 'interior'],
    safeStyleTerms: ['timber accents', 'bamboo textures', 'daylight', 'fog']
  },
  {
    id: 'style_night_ext',
    name: 'Night Exterior',
    description: 'Twilight architectural rendering, glowing led outlines, deep starry horizon.',
    promptTemplate: 'contemporary architecture at twilight, glowing led accent lighting, warm light spills, starry night sky, wet ground reflections, moody lighting',
    negativePrompt: 'daylight, sun, bright shadows, sketch, painting, low quality, noisy, deformed, text, watermark',
    defaultGeometryLockMode: 'balanced',
    defaultSettings: { steps: 35, cfg_scale: 8.0, denoise: 0.65 },
    allowedSceneTypes: ['Exterior', 'Aerial Studio'],
    blockedTerms: ['driveway', 'windows', 'villa', 'pool', 'sofa', 'fireplace', 'interior'],
    safeStyleTerms: ['twilight', 'led accent', 'starry night', 'reflections']
  },
  {
    id: 'style_brut_moody',
    name: 'Brutalist Moody',
    description: 'Monolithic raw concrete textures, overcast lighting, moody atmospheric detailing.',
    promptTemplate: 'brutalist architectural style, monolithic raw concrete walls, water staining texture, overcast cloudy grey sky, dramatic side lighting, geometric structure, moody cinematic atmosphere',
    negativePrompt: 'sunny, bright, high contrast, warm colors, deformed, lowres, blurry, sketch, text, watermark',
    defaultGeometryLockMode: 'accurate',
    defaultSettings: { steps: 30, cfg_scale: 7.5, denoise: 0.55 },
    allowedSceneTypes: ['Exterior', 'Aerial Studio'],
    blockedTerms: ['facade', 'villa', 'pool', 'sofa', 'fireplace', 'garden', 'interior'],
    safeStyleTerms: ['concrete', 'water staining', 'overcast', 'side lighting']
  }
];

