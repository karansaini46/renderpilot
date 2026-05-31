import { 
  validateFolder, 
  validateExtension, 
  buildProjectS3Key, 
  createPresignedUploadUrl, 
  createPresignedDownloadUrl 
} from './src/lib/storage';

console.log("=== S3 Unit Tests ===");

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error("Assertion Failed:", message);
    process.exit(1);
  }
}

// 1. Test validateFolder
console.log("1. Testing validateFolder...");
assert(validateFolder('inputs') === true, "inputs should be allowed");
assert(validateFolder('outputs') === true, "outputs should be allowed");
assert(validateFolder('approved') === true, "approved should be allowed");
assert(validateFolder('training') === true, "training should be allowed");
assert(validateFolder('exports') === true, "exports should be allowed");
assert(validateFolder('previews') === true, "previews should be allowed");
assert(validateFolder('temp') === false, "temp should not be allowed");
assert(validateFolder('secrets') === false, "secrets should not be allowed");
console.log("   -> Pass: validateFolder works");

// 2. Test validateExtension
console.log("2. Testing validateExtension...");
assert(validateExtension('test.png') === true, ".png should be allowed");
assert(validateExtension('image.jpg') === true, ".jpg should be allowed");
assert(validateExtension('image.jpeg') === true, ".jpeg should be allowed");
assert(validateExtension('image.webp') === true, ".webp should be allowed");
assert(validateExtension('mesh.glb') === true, ".glb should be allowed");
assert(validateExtension('mesh.obj') === true, ".obj should be allowed");
assert(validateExtension('mesh.fbx') === true, ".fbx should be allowed");
assert(validateExtension('model.blend') === true, ".blend should be allowed");
assert(validateExtension('archive.zip') === true, ".zip should be allowed");
assert(validateExtension('script.js') === false, ".js should not be allowed");
assert(validateExtension('malware.exe') === false, ".exe should not be allowed");
assert(validateExtension('doc.pdf') === false, ".pdf should not be allowed");
console.log("   -> Pass: validateExtension works");

// 3. Test buildProjectS3Key
console.log("3. Testing buildProjectS3Key...");
const key = buildProjectS3Key('user-123', 'proj-456', 'inputs', 'sketch.png');
const expected = "users/user-123/projects/proj-456/inputs/sketch.png";
assert(key === expected, `Key mismatch: got ${key}, expected ${expected}`);

// Test folder injection / filename sanitization
const dangerousKey = buildProjectS3Key('user-123', 'proj-456', 'inputs', '../sketch.png');
assert(!dangerousKey.includes('..'), "Filename should be sanitized to remove directory traversal characters");
console.log("   -> Pass: buildProjectS3Key works");

// 4. Test Presigned URL Generation
async function testUrls() {
  console.log("4. Testing Presigned URL Generation...");
  
  // Set fallback mockup credentials for signature calculation
  process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  process.env.AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || 'test-bucket';
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'AKIAIOSFODNN7EXAMPLE';
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

  try {
    const uploadUrl = await createPresignedUploadUrl(key, 'image/png');
    assert(uploadUrl.includes('test-bucket'), "Upload URL must contain bucket name");
    assert(uploadUrl.includes('users/user-123/projects/proj-456/inputs'), "Upload URL must contain S3 key path");
    assert(uploadUrl.includes('X-Amz-Expires=600'), "Upload URL must have 10 min expiry");
    console.log("   -> Pass: createPresignedUploadUrl works");

    const downloadUrl = await createPresignedDownloadUrl(key);
    assert(downloadUrl.includes('test-bucket'), "Download URL must contain bucket name");
    assert(downloadUrl.includes('X-Amz-Expires=900'), "Download URL must have 15 min expiry");
    console.log("   -> Pass: createPresignedDownloadUrl works");
    
    console.log("All TS S3 unit tests passed successfully!");
  } catch (err: any) {
    console.error("Failed S3 URL generation test:", err.message);
    process.exit(1);
  }
}

testUrls();
