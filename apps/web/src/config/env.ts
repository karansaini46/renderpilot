/**
 * Next.js server-side typed environment variables and configuration validation.
 */

export interface WebConfig {
  DATABASE_URL: string;
  STORAGE_PROVIDER: string;
  STORAGE_BUCKET: string;
  STORAGE_PUBLIC_BASE_URL: string;
}

const REQUIRED_WEB_ENV_VARS = [
  'DATABASE_URL',
  'STORAGE_PROVIDER',
  'STORAGE_BUCKET',
  'STORAGE_PUBLIC_BASE_URL',
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

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER!,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET!,
    STORAGE_PUBLIC_BASE_URL: process.env.STORAGE_PUBLIC_BASE_URL!,
  };
}

// Perform validation on module import so it halts startup/request execution immediately
export const env = validateEnv();
