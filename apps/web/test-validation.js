const REQUIRED_WEB_ENV_VARS = [
  'DATABASE_URL',
  'STORAGE_PROVIDER',
  'STORAGE_BUCKET',
  'STORAGE_PUBLIC_BASE_URL',
  'AWS_REGION',
  'AWS_S3_BUCKET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
];

function validateEnv() {
  const missing = [];

  for (const key of REQUIRED_WEB_ENV_VARS) {
    const value = process.env[key];
    if (value === undefined || value === null || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const errorMessage = `[Configuration Error] Missing required web environment variables: ${missing.join(', ')}. Please refer to .env.example.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL,
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    STORAGE_PUBLIC_BASE_URL: process.env.STORAGE_PUBLIC_BASE_URL,
    AWS_REGION: process.env.AWS_REGION,
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

try {
  const env = validateEnv();
  console.log("SUCCESS");
  console.log(`STORAGE_PROVIDER=${env.STORAGE_PROVIDER}`);
  console.log(`STORAGE_BUCKET=${env.STORAGE_BUCKET}`);
  console.log(`STORAGE_PUBLIC_BASE_URL=${env.STORAGE_PUBLIC_BASE_URL}`);
} catch (e) {
  process.exit(1);
}
