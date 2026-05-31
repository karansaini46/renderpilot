-- SQLite Style Seeds for RenderPilot

INSERT OR REPLACE INTO styles (id, name, prompt_template, negative_prompt, settings_json, active)
VALUES 
(
    'style_mod_lux_ext',
    'Modern Luxury Exterior',
    'modern luxury concrete and glass villa, cantilevered balconies, infinity pool reflecting warm glowing architectural lights, sunset sky, landscaped garden, architectural digest photography, high-end design',
    'deformed, blurry, low quality, sketch, drawing, lowres, text, watermark, logo, bad lighting',
    '{"default_steps": 30, "default_cfg": 7.5, "guidance_strength": 0.8}',
    1
),
(
    'style_warm_lux_int',
    'Warm Luxury Interior',
    'luxury warm living room interior, oak wood paneling, travertine marble fireplace, bouclé fabric sofa, soft ambient lighting, high ceilings, large windows looking out to a garden, premium furniture, cozy mood',
    'deformed, low quality, dark shadows, noisy, text, watermark, bad framing, drawing, illustration',
    '{"default_steps": 28, "default_cfg": 7.0, "guidance_strength": 0.75}',
    1
),
(
    'style_min_white',
    'Minimal White Concept',
    'conceptual architectural model, minimalist white matte surfaces, clean sharp shadows, geometric grid lines, studio lighting background, pure white and soft grey tones, sharp contours, wireframe details',
    'textures, complex colors, realistic landscape, busy background, text, watermark, low quality, dark',
    '{"default_steps": 20, "default_cfg": 6.5, "guidance_strength": 0.6}',
    1
),
(
    'style_trop_villa',
    'Tropical Villa',
    'open-air tropical architectural pavilion, teak wood pillars, thatched bamboo detailing, surrounded by lush palm trees, volcanic stone pathways, bright sunny daylight, cinematic volumetric fog, holiday resort vibe',
    'snow, winter, dry landscape, city buildings, deformed, lowres, blurry, text, logo, dark lighting',
    '{"default_steps": 30, "default_cfg": 8.0, "guidance_strength": 0.85}',
    1
),
(
    'style_night_ext',
    'Night Exterior',
    'contemporary smart home architecture at twilight, glowing led outline trim, warm interior light showing through floor-to-ceiling glass panes, starry night sky, wet concrete driveway reflections, moody lighting',
    'daylight, sun, bright shadows, sketch, painting, low quality, noisy, deformed, text, watermark',
    '{"default_steps": 35, "default_cfg": 8.0, "guidance_strength": 0.8}',
    1
),
(
    'style_real_estate',
    'Real Estate Bright',
    'professional real estate exterior photograph, bright daylight, wide-angle lens, clean manicured lawn, fresh paint, crystal clear blue sky, inviting front facade, high-end residential neighborhood',
    'gloomy, dark, overcast sky, heavy grading, high contrast, artistic shadows, text, logo, sketch, drawing',
    '{"default_steps": 25, "default_cfg": 7.0, "guidance_strength": 0.7}',
    1
);
