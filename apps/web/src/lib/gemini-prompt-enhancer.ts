import { env } from '../config/env';

export interface GeminiEnhancementTracker {
  status: 'applied' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Enhances a rule-based architectural render positive prompt using Gemini.
 * If the enhancer is disabled, API key is missing, or the call fails/times out,
 * it returns the original prompt.
 *
 * @param input The original rule-based prompt.
 * @param tracker Optional object to track status (applied, skipped, failed) and errors.
 * @returns The enhanced prompt or original prompt on skip/failure.
 */
export async function enhancePromptWithGemini(
  input: string,
  tracker?: GeminiEnhancementTracker
): Promise<string> {
  // Check if server-side only
  if (typeof window !== 'undefined') {
    if (tracker) tracker.status = 'skipped';
    console.log('Gemini enhancer skipped: browser environment');
    return input;
  }

  // Return the original prompt if GEMINI_PROMPT_ENHANCER_ENABLED is not enabled
  if (!env.GEMINI_PROMPT_ENHANCER_ENABLED) {
    if (tracker) tracker.status = 'skipped';
    console.log('Gemini enhancer skipped: enhancer disabled');
    return input;
  }

  // Return the original prompt if GEMINI_API_KEY is missing
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    if (tracker) tracker.status = 'skipped';
    console.log('Gemini enhancer skipped: missing API key');
    return input;
  }

  if (!input || input.trim() === '') {
    if (tracker) tracker.status = 'skipped';
    console.log('Gemini enhancer skipped: empty input');
    return input;
  }

  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemInstruction = `You are a professional architectural visualization prompt engineer and enhancer.
Your task is to take a raw/rule-based architectural render positive prompt and enhance it into a highly detailed, professional-grade Stable Diffusion positive prompt.

CRITICAL INSTRUCTION: DO NOT REDESIGN OR ALTER THE BUILDING. The original architectural geometry must be preserved exactly.

STRICT PRESERVATION RULES:
1. DO NOT change the building shape, proportions, roofline, balcony, walls, gate, windows, doors, railings, pillars, camera angle, elevation, or perspective.
2. Do NOT add new structural elements, rooms, openings, or floors.
3. Preserve the core materials (e.g. wood, concrete, glass, metal) and their layout.
4. Preserve the lighting logic, reflections, glass properties, mirror properties, shadows, and overall atmosphere.
5. Preserve the user's intent and any explicit modifiers or style preferences.

ENHANCEMENT ONLY RULES:
1. ONLY improve photorealism, lighting, materials, shadows, reflections, glass properties, vegetation, landscape scenery, and texture quality.
2. Add vivid, sensory material detail (e.g. instead of just "concrete", describe "rough exposed concrete with visible aggregate texture and matte finish").
3. Enhance lighting descriptions (e.g. specify light color temperature, ambient soft light, soft shadows, sharp architectural highlights).
4. Use professional architectural photography terms (e.g. "architectural photography, sharp focus, 8k resolution, photorealistic").
5. Output ONLY the final enhanced positive prompt. Do NOT include any explanations, introductory text, markdown code block formatting (such as \`\`\`), or additional commentary. The entire response must be a single comma-separated string containing the prompt.`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemInstruction },
          { text: `Here is the architectural render prompt to enhance. Provide only the final enhanced positive prompt as output:\n\n${input}` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1000
    }
  };

  // Timeout controller (8 seconds)
  const timeoutMs = 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  console.log('Gemini enhancer attempted');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API returned error status ${response.status}: ${errorText}`);
    }

    const jsonResponse = await response.json();
    let responseText = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText || responseText.trim() === '') {
      throw new Error('Gemini returned an empty response or invalid structure.');
    }

    // Sanitize responseText: remove any markdown backticks, code blocks, or extra newlines
    responseText = responseText.trim();
    
    // Remove code block wraps if any
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```[a-zA-Z]*\n?/, '');
      responseText = responseText.replace(/```$/, '');
      responseText = responseText.trim();
    }

    if (!responseText || responseText.trim() === '') {
      throw new Error('Enhanced prompt became empty after sanitization.');
    }

    console.log('Gemini enhancer applied');
    if (tracker) {
      tracker.status = 'applied';
    }
    return responseText;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    let errMsg = error.message;
    if (error.name === 'AbortError') {
      errMsg = `Request timed out after ${timeoutMs}ms`;
    }

    console.log(`Gemini enhancer failed: ${errMsg}`);
    
    if (tracker) {
      tracker.status = 'failed';
      tracker.error = errMsg;
    }
    
    // Fallback: return the original prompt
    return input;
  }
}
