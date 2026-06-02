export interface StylePreset {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;
  negativePrompt: string;
  defaultGeometryLockMode: 'locked' | 'flexible';
  defaultSettings: {
    steps: number;
    cfg_scale: number;
    denoise: number;
    guidance_strength?: number;
  };
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'style_mod_lux_ext',
    name: 'Modern Luxury Exterior',
    description: 'Cantilevered concrete, floor-to-ceiling glass, glowing pool side sunset reflections, high-end digest look.',
    promptTemplate: 'modern luxury concrete and glass villa, cantilevered balconies, infinity pool reflecting warm glowing architectural lights, sunset sky, landscaped garden, architectural digest photography, high-end design',
    negativePrompt: 'deformed, blurry, low quality, sketch, drawing, lowres, text, watermark, logo, bad lighting',
    defaultGeometryLockMode: 'flexible',
    defaultSettings: { steps: 30, cfg_scale: 7.5, denoise: 0.65 }
  },
  {
    id: 'style_warm_int',
    name: 'Warm Interior',
    description: 'Oak panels, travertine fireplaces, bouclé fabrics, ambient twilight glows, cozy and premium.',
    promptTemplate: 'luxury warm living room interior, oak wood paneling, travertine fireplace, bouclé fabric sofa, soft ambient lighting, high ceilings, large windows looking out to a garden, premium furniture, cozy mood',
    negativePrompt: 'deformed, low quality, dark shadows, noisy, text, watermark, bad framing, drawing, illustration',
    defaultGeometryLockMode: 'flexible',
    defaultSettings: { steps: 28, cfg_scale: 7.0, denoise: 0.65 }
  },
  {
    id: 'style_min_white',
    name: 'Minimal White',
    description: 'Geometric grid lines, sharp shadow play, conceptual architectural white-model aesthetics.',
    promptTemplate: 'conceptual architectural model, minimalist white matte surfaces, clean sharp shadows, geometric grid lines, studio lighting background, pure white and soft grey tones, sharp contours, wireframe details',
    negativePrompt: 'textures, complex colors, realistic landscape, busy background, text, watermark, low quality, dark',
    defaultGeometryLockMode: 'locked',
    defaultSettings: { steps: 20, cfg_scale: 6.5, denoise: 0.50 }
  },
  {
    id: 'style_trop_villa',
    name: 'Tropical Villa',
    description: 'Teak posts, bamboo detailing, lush volcanic stone paths, cinematic daylight resorts.',
    promptTemplate: 'open-air tropical architectural pavilion, teak wood pillars, thatched bamboo detailing, surrounded by lush palm trees, volcanic stone pathways, bright sunny daylight, cinematic volumetric fog, holiday resort vibe',
    negativePrompt: 'snow, winter, dry landscape, city buildings, deformed, lowres, blurry, text, logo, dark lighting',
    defaultGeometryLockMode: 'flexible',
    defaultSettings: { steps: 30, cfg_scale: 8.0, denoise: 0.70 }
  },
  {
    id: 'style_night_ext',
    name: 'Night Exterior',
    description: 'Twilight smart home exteriors, wet driveway outline glows, deep starry horizons.',
    promptTemplate: 'contemporary smart home architecture at twilight, glowing led outline trim, warm interior light showing through floor-to-ceiling glass panes, starry night sky, wet concrete driveway reflections, moody lighting',
    negativePrompt: 'daylight, sun, bright shadows, sketch, painting, low quality, noisy, deformed, text, watermark',
    defaultGeometryLockMode: 'flexible',
    defaultSettings: { steps: 35, cfg_scale: 8.0, denoise: 0.65 }
  },
  {
    id: 'style_brut_moody',
    name: 'Brutalist Moody',
    description: 'Monolithic raw concrete facades, overcast side-light drama, moody atmospheric staining.',
    promptTemplate: 'raw brutalist architectural facade, monolithic raw concrete walls, water staining, overcast cloudy grey sky, dramatic side lighting, geometric structure, overgrown ferns, moody cinematic atmosphere',
    negativePrompt: 'sunny, bright, high contrast, warm colors, deformed, lowres, blurry, sketch, text, watermark',
    defaultGeometryLockMode: 'locked',
    defaultSettings: { steps: 30, cfg_scale: 7.5, denoise: 0.55 }
  }
];
