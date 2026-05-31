import { env } from './src/config/env';

console.log("SUCCESS");
console.log(`STORAGE_PROVIDER=${env.STORAGE_PROVIDER}`);
console.log(`STORAGE_BUCKET=${env.STORAGE_BUCKET}`);
console.log(`STORAGE_PUBLIC_BASE_URL=${env.STORAGE_PUBLIC_BASE_URL}`);
// DATABASE_URL is sensitive, so we do not print it.
