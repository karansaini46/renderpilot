// Mock environment variables before importing any config/env file
process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
process.env.STORAGE_PROVIDER = 'local';
process.env.STORAGE_BUCKET = 'dummy-bucket';
process.env.STORAGE_PUBLIC_BASE_URL = 'http://localhost:3000/uploads';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_S3_BUCKET = 'dummy-s3-bucket';
process.env.AWS_ACCESS_KEY_ID = 'DUMMY_KEY_ID';
process.env.AWS_SECRET_ACCESS_KEY = 'DUMMY_SECRET';

import assert from 'assert';
import { enhancePromptWithGemini } from './gemini-prompt-enhancer';
import { env } from '../config/env';

// Mock environment variables
const originalEnv = { ...process.env };
const originalEnhancerEnabled = env.GEMINI_PROMPT_ENHANCER_ENABLED;
const originalApiKey = env.GEMINI_API_KEY;

async function runTests() {
  console.log('Running Gemini Prompt Enhancer Unit Tests...\n');

  // Test 1: Should return original prompt if disabled
  {
    console.log('Test 1: Returns original prompt if disabled');
    env.GEMINI_PROMPT_ENHANCER_ENABLED = false;
    env.GEMINI_API_KEY = 'some-key';
    const originalPrompt = 'architectural visualization of a house';
    const result = await enhancePromptWithGemini(originalPrompt);
    assert.strictEqual(result, originalPrompt);
    console.log('  -> PASS');
  }

  // Test 2: Should return original prompt if API key is missing
  {
    console.log('Test 2: Returns original prompt if API key is missing');
    env.GEMINI_PROMPT_ENHANCER_ENABLED = true;
    env.GEMINI_API_KEY = '';
    const originalPrompt = 'architectural visualization of a house';
    const result = await enhancePromptWithGemini(originalPrompt);
    assert.strictEqual(result, originalPrompt);
    console.log('  -> PASS');
  }

  // Test 3: Handles API success and returns enhanced prompt
  {
    console.log('Test 3: Handles API success and returns enhanced prompt');
    env.GEMINI_PROMPT_ENHANCER_ENABLED = true;
    env.GEMINI_API_KEY = 'mock-key';

    const mockResponseText = 'Enhanced prompt text from Gemini';
    const originalFetch = (global as any).fetch;
    (global as any).fetch = async (url: string, init?: any) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: mockResponseText }]
              }
            }
          ]
        })
      };
    };

    const tracker = { status: 'skipped' as any };
    const result = await enhancePromptWithGemini('original prompt', tracker);
    assert.strictEqual(result, mockResponseText);
    assert.strictEqual(tracker.status, 'applied');

    (global as any).fetch = originalFetch;
    console.log('  -> PASS');
  }

  // Test 4: Handles API timeout / failure gracefully
  {
    console.log('Test 4: Handles API failure gracefully');
    env.GEMINI_PROMPT_ENHANCER_ENABLED = true;
    env.GEMINI_API_KEY = 'mock-key';

    const originalFetch = (global as any).fetch;
    (global as any).fetch = async (url: string, init?: any) => {
      throw new Error('Network failure');
    };

    const tracker = { status: 'skipped' as any, error: undefined as any };
    const originalPrompt = 'original prompt';
    const result = await enhancePromptWithGemini(originalPrompt, tracker);
    assert.strictEqual(result, originalPrompt);
    assert.strictEqual(tracker.status, 'failed');
    assert.ok(tracker.error.includes('Network failure'));

    (global as any).fetch = originalFetch;
    console.log('  -> PASS');
  }

  // Test 5: Strips markdown code blocks
  {
    console.log('Test 5: Strips markdown code blocks');
    env.GEMINI_PROMPT_ENHANCER_ENABLED = true;
    env.GEMINI_API_KEY = 'mock-key';

    const originalFetch = (global as any).fetch;
    (global as any).fetch = async (url: string, init?: any) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '```\nEnhanced prompt with code blocks\n```' }]
              }
            }
          ]
        })
      };
    };

    const result = await enhancePromptWithGemini('original prompt');
    assert.strictEqual(result, 'Enhanced prompt with code blocks');

    (global as any).fetch = originalFetch;
    console.log('  -> PASS');
  }

  // Restore environment variables
  process.env = originalEnv;
  env.GEMINI_PROMPT_ENHANCER_ENABLED = originalEnhancerEnabled;
  env.GEMINI_API_KEY = originalApiKey;
  console.log('\nAll Gemini Prompt Enhancer Unit Tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
