/**
 * Next.js server-side typed environment variables and configuration validation.
 */

export interface WebConfig {
  DATABASE_URL: string;
  STORAGE_PROVIDER: string;
  STORAGE_BUCKET: string;
  STORAGE_PUBLIC_BASE_URL: string;
  AWS_REGION: string;
  AWS_S3_BUCKET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;

  // PromptBrain
  PROMPT_BRAIN_PROVIDER: 'gemini' | 'manual';
  PROMPT_BRAIN_FALLBACK: 'manual';
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  PROMPT_BRAIN_TIMEOUT_MS: number;
  PROMPT_BRAIN_MIN_CONFIDENCE: number;
  PROMPT_BRAIN_CACHE_ENABLED: boolean;
}

const REQUIRED_WEB_ENV_VARS = [
  'DATABASE_URL',
  'STORAGE_PROVIDER',
  'STORAGE_BUCKET',
  'STORAGE_PUBLIC_BASE_URL',
  'AWS_REGION',
  'AWS_S3_BUCKET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const;

function validateEnv(): WebConfig {
  const missing: string[] = [];

  for (const key of REQUIRED_WEB_ENV_VARS) {
    const value = process.env[key];
    if (value === undefined || value === null || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    // Produce a clear error message indicating exactly what is missing.
    // We never log values or display secrets in cleartext.
    const errorMessage = `[Configuration Error] Missing required web environment variables: ${missing.join(', ')}. Please refer to .env.example.`;
    
    // Log the error to stdout/stderr without secrets
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  const provider = (process.env.PROMPT_BRAIN_PROVIDER || 'manual').trim().toLowerCase();
  if (provider !== 'gemini' && provider !== 'manual') {
    throw new Error(`[Configuration Error] Invalid PROMPT_BRAIN_PROVIDER: must be 'gemini' or 'manual'`);
  }

  const fallback = (process.env.PROMPT_BRAIN_FALLBACK || 'manual').trim().toLowerCase();
  if (fallback !== 'manual') {
    throw new Error(`[Configuration Error] Invalid PROMPT_BRAIN_FALLBACK: must be 'manual'`);
  }

  const geminiApiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : undefined;
  if (provider === 'gemini' && (!geminiApiKey || geminiApiKey === '')) {
    throw new Error(`[Configuration Error] GEMINI_API_KEY is required when PROMPT_BRAIN_PROVIDER is 'gemini'`);
  }

  const geminiModel = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

  let timeout = 20000;
  if (process.env.PROMPT_BRAIN_TIMEOUT_MS) {
    const parsed = parseInt(process.env.PROMPT_BRAIN_TIMEOUT_MS, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(`[Configuration Error] Invalid PROMPT_BRAIN_TIMEOUT_MS: must be a positive integer`);
    }
    timeout = parsed;
  }

  let minConfidence = 0.75;
  if (process.env.PROMPT_BRAIN_MIN_CONFIDENCE) {
    const parsed = parseFloat(process.env.PROMPT_BRAIN_MIN_CONFIDENCE);
    if (isNaN(parsed) || parsed < 0 || parsed > 1) {
      throw new Error(`[Configuration Error] Invalid PROMPT_BRAIN_MIN_CONFIDENCE: must be a float between 0.0 and 1.0`);
    }
    minConfidence = parsed;
  }

  let cacheEnabled = true;
  if (process.env.PROMPT_BRAIN_CACHE_ENABLED) {
    const val = process.env.PROMPT_BRAIN_CACHE_ENABLED.trim().toLowerCase();
    if (val === 'true') {
      cacheEnabled = true;
    } else if (val === 'false') {
      cacheEnabled = false;
    } else {
      throw new Error(`[Configuration Error] Invalid PROMPT_BRAIN_CACHE_ENABLED: must be 'true' or 'false'`);
    }
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER!,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET!,
    STORAGE_PUBLIC_BASE_URL: process.env.STORAGE_PUBLIC_BASE_URL!,
    AWS_REGION: process.env.AWS_REGION!,
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET!,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID!,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY!,
    PROMPT_BRAIN_PROVIDER: provider as 'gemini' | 'manual',
    PROMPT_BRAIN_FALLBACK: fallback as 'manual',
    GEMINI_API_KEY: geminiApiKey,
    GEMINI_MODEL: geminiModel,
    PROMPT_BRAIN_TIMEOUT_MS: timeout,
    PROMPT_BRAIN_MIN_CONFIDENCE: minConfidence,
    PROMPT_BRAIN_CACHE_ENABLED: cacheEnabled,
  };
}

// Perform validation on module import so it halts startup/request execution immediately
export const env = validateEnv();
