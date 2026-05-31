const ALLOWED_FOLDERS = ['inputs', 'outputs', 'approved', 'training', 'exports', 'previews'];
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'glb', 'obj', 'fbx', 'blend', 'zip'];

function validateFolder(folder) {
  return ALLOWED_FOLDERS.includes(folder);
}

function validateExtension(filename) {
  const parts = filename.split('.');
  if (parts.length < 2) return false;
  const ext = parts.pop().toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

function buildProjectS3Key(userId, projectId, folder, filename) {
  if (!validateFolder(folder)) {
    throw new Error(`Invalid storage folder: ${folder}`);
  }
  if (!validateExtension(filename)) {
    throw new Error(`Invalid file type/extension for file: ${filename}`);
  }

  // Split stem and extension to sanitize them separately and prevent directory traversal
  const parts = filename.split('.');
  const ext = parts.pop().toLowerCase();
  const stem = parts.join('.');
  
  const cleanStem = stem.replace(/[^a-zA-Z0-9\-_]/g, '_');
  const cleanFilename = `${cleanStem}.${ext}`;
  
  return `users/${userId}/projects/${projectId}/${folder}/${cleanFilename}`;
}

console.log("=== S3 Validation Unit Tests (Node) ===");

function assert(condition, message) {
  if (!condition) {
    console.error("Assertion Failed:", message);
    process.exit(1);
  }
}

// 1. Test validateFolder
console.log("1. Testing validateFolder...");
assert(validateFolder('inputs') === true, "inputs folder should be allowed");
assert(validateFolder('outputs') === true, "outputs folder should be allowed");
assert(validateFolder('approved') === true, "approved folder should be allowed");
assert(validateFolder('training') === true, "training folder should be allowed");
assert(validateFolder('exports') === true, "exports folder should be allowed");
assert(validateFolder('previews') === true, "previews folder should be allowed");
assert(validateFolder('temp') === false, "temp folder should not be allowed");
assert(validateFolder('secrets') === false, "secrets folder should not be allowed");
console.log("   -> Pass: validateFolder works");

// 2. Test validateExtension
console.log("2. Testing validateExtension...");
assert(validateExtension('test.png') === true, ".png file should be allowed");
assert(validateExtension('model.blend') === true, ".blend file should be allowed");
assert(validateExtension('archive.zip') === true, ".zip file should be allowed");
assert(validateExtension('script.js') === false, ".js file should not be allowed");
assert(validateExtension('malware.exe') === false, ".exe file should not be allowed");
console.log("   -> Pass: validateExtension works");

// 3. Test buildProjectS3Key
console.log("3. Testing buildProjectS3Key...");
const key = buildProjectS3Key('user-123', 'proj-456', 'inputs', 'sketch.png');
const expected = "users/user-123/projects/proj-456/inputs/sketch.png";
assert(key === expected, `Key mismatch: got ${key}, expected ${expected}`);

// Test folder injection / filename sanitization
const dangerousKey = buildProjectS3Key('user-123', 'proj-456', 'inputs', '../sketch.png');
assert(!dangerousKey.includes('..'), "Filename should be sanitized to remove directory traversal");
console.log("   -> Pass: buildProjectS3Key works");

console.log("All local S3 validation tests passed successfully!");
