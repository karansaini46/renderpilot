-- PostgreSQL Style Seeds for RenderPilot
-- Seeding default architectural styles

INSERT INTO styles (id, name, prompt_template, negative_prompt, settings_json, active)
VALUES 
(
    'style_mod_lux_ext',
    'Modern Luxury Exterior',
    'modern luxury concrete and glass villa, cantilevered balconies, infinity pool reflecting warm glowing architectural lights, sunset sky, landscaped garden, architectural digest photography, high-end design',
    'deformed, blurry, low quality, sketch, drawing, lowres, text, watermark, logo, bad lighting',
    '{"default_steps": 30, "default_cfg": 7.5, "guidance_strength": 0.8}',
    TRUE
),
(
    'style_warm_int',
    'Warm Interior',
    'luxury warm living room interior, oak wood paneling, travertine marble fireplace, bouclé fabric sofa, soft ambient lighting, high ceilings, large windows looking out to a garden, premium furniture, cozy mood',
    'deformed, low quality, dark shadows, noisy, text, watermark, bad framing, drawing, illustration',
    '{"default_steps": 28, "default_cfg": 7.0, "guidance_strength": 0.75}',
    TRUE
),
(
    'style_min_white',
    'Minimal White',
    'conceptual architectural model, minimalist white matte surfaces, clean sharp shadows, geometric grid lines, studio lighting background, pure white and soft grey tones, sharp contours, wireframe details',
    'textures, complex colors, realistic landscape, busy background, text, watermark, low quality, dark',
    '{"default_steps": 20, "default_cfg": 6.5, "guidance_strength": 0.6}',
    TRUE
),
(
    'style_trop_villa',
    'Tropical Villa',
    'open-air tropical architectural pavilion, teak wood pillars, thatched bamboo detailing, surrounded by lush palm trees, volcanic stone pathways, bright sunny daylight, cinematic volumetric fog, holiday resort vibe',
    'snow, winter, dry landscape, city buildings, deformed, lowres, blurry, text, logo, dark lighting',
    '{"default_steps": 30, "default_cfg": 8.0, "guidance_strength": 0.85}',
    TRUE
),
(
    'style_night_ext',
    'Night Exterior',
    'contemporary smart home architecture at twilight, glowing led outline trim, warm interior light showing through floor-to-ceiling glass panes, starry night sky, wet concrete driveway reflections, moody lighting',
    'daylight, sun, bright shadows, sketch, painting, low quality, noisy, deformed, text, watermark',
    '{"default_steps": 35, "default_cfg": 8.0, "guidance_strength": 0.8}',
    TRUE
),
(
    'style_brut_moody',
    'Brutalist Moody',
    'raw brutalist architectural facade, monolithic raw concrete walls, water staining, overcast cloudy grey sky, dramatic side lighting, geometric structure, overgrown ferns, moody cinematic atmosphere',
    'sunny, bright, high contrast, warm colors, deformed, lowres, blurry, sketch, text, watermark',
    '{"default_steps": 30, "default_cfg": 7.5, "guidance_strength": 0.8}',
    TRUE
)
ON CONFLICT (name) DO UPDATE 
SET prompt_template = EXCLUDED.prompt_template,
    negative_prompt = EXCLUDED.negative_prompt,
    settings_json = EXCLUDED.settings_json,
    active = EXCLUDED.active;
