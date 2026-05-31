import { env } from './src/config/env';

console.log("SUCCESS");
console.log(`STORAGE_PROVIDER=${env.STORAGE_PROVIDER}`);
console.log(`STORAGE_BUCKET=${env.STORAGE_BUCKET}`);
console.log(`STORAGE_PUBLIC_BASE_URL=${env.STORAGE_PUBLIC_BASE_URL}`);
console.log(`AWS_REGION=${env.AWS_REGION}`);
console.log(`AWS_S3_BUCKET=${env.AWS_S3_BUCKET}`);
// DATABASE_URL, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are sensitive and never printed.
