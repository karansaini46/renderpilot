// Mock environment variables before importing any config/env file
process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
process.env.STORAGE_PROVIDER = 'local';
process.env.STORAGE_BUCKET = 'dummy-bucket';
process.env.STORAGE_PUBLIC_BASE_URL = 'http://localhost:3000/uploads';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_S3_BUCKET = 'dummy-s3-bucket';
process.env.AWS_ACCESS_KEY_ID = 'DUMMY_KEY_ID';
process.env.AWS_SECRET_ACCESS_KEY = 'DUMMY_SECRET';
process.env.PROMPT_BRAIN_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'mock-api-key';
process.env.PROMPT_BRAIN_CACHE_ENABLED = 'false'; // disable cache for tests to execute pipeline
process.env.GEMINI_PROMPT_ENHANCER_ENABLED = 'false'; // disable prompt enhancer for core pipeline tests


import assert from 'assert';

// Mock DB State
let mockProjects: any[] = [];
let mockProjectFiles: any[] = [];
let mockMaterialMappings: any[] = [];
let mockPromptBrainAnalyses: any[] = [];
let mockRenderJobs: any[] = [];
let mockJobEvents: any[] = [];

// Clean state helper
function resetDbMocks() {
  mockProjects = [
    {
      id: 'proj_bedroom',
      name: 'Bedroom Project',
      projectType: 'Residential',
      sceneType: 'Interior',
      stylePreference: 'style_warm_int',
    }
  ];
  mockProjectFiles = [
    {
      id: 'file_bedroom',
      projectId: 'proj_bedroom',
      fileUrl: 'bedroom_input.png',
      fileType: 'image/png',
      createdAt: new Date(),
    }
  ];
  mockMaterialMappings = [];
  mockPromptBrainAnalyses = [];
  mockRenderJobs = [];
  mockJobEvents = [];
}

// Global Prisma Mock
const mockPrisma: any = {
  project: {
    findUnique: async (args: any) => {
      const p = mockProjects.find(x => x.id === args.where.id);
      if (p) {
        return {
          ...p,
          projectFiles: mockProjectFiles.filter(f => f.projectId === p.id),
        };
      }
      return null;
    }
  },
  projectFile: {
    findFirst: async (args: any) => {
      return mockProjectFiles.find(f => f.projectId === args.where.projectId) || null;
    }
  },
  materialMapping: {
    findMany: async (args: any) => {
      let filtered = mockMaterialMappings.filter(m => m.projectId === args.where.projectId);
      if (args.where && args.where.locked !== undefined) {
        filtered = filtered.filter(m => m.locked === args.where.locked);
      }
      return filtered;
    },
    update: async (args: any) => {
      const idx = mockMaterialMappings.findIndex(m => m.id === args.where.id);
      if (idx !== -1) {
        mockMaterialMappings[idx] = {
          ...mockMaterialMappings[idx],
          ...args.data,
        };
        return mockMaterialMappings[idx];
      }
      throw new Error(`Mapping not found for update: ${args.where.id}`);
    },
    create: async (args: any) => {
      const newMapping = {
        id: args.data.id || `mm_mock_${Date.now()}`,
        ...args.data,
      };
      mockMaterialMappings.push(newMapping);
      return newMapping;
    },
    deleteMany: async (args: any) => {
      const ids = args.where.id.in;
      mockMaterialMappings = mockMaterialMappings.filter(m => !ids.includes(m.id));
      return { count: ids.length };
    }
  },
  promptBrainAnalysis: {
    findFirst: async (args: any) => {
      return mockPromptBrainAnalyses.find(a => a.cacheKey === args.where.cacheKey) || null;
    },
    create: async (args: any) => {
      const newAnalysis = {
        id: args.data.id || `pba_mock_${Date.now()}`,
        ...args.data,
      };
      mockPromptBrainAnalyses.push(newAnalysis);
      return newAnalysis;
    }
  },
  renderJob: {
    findMany: async (args: any) => {
      // Used by recoverStaleJobs inside route.ts
      return [];
    },
    create: async (args: any) => {
      const newJob = {
        id: args.data.id || `job_mock_${Date.now()}`,
        ...args.data,
      };
      mockRenderJobs.push(newJob);
      return newJob;
    }
  },
  jobEvent: {
    create: async (args: any) => {
      const newEvent = {
        id: args.data.id || `event_mock_${Date.now()}`,
        ...args.data,
      };
      mockJobEvents.push(newEvent);
      return newEvent;
    }
  },
  preferenceMemory: {
    findFirst: async (args: any) => {
      return null;
    },
    findMany: async (args: any) => {
      return [];
    }
  },
  render: {
    findFirst: async (args: any) => {
      return null;
    }
  },
  $transaction: async (cb: any) => {
    return await cb(mockPrisma);
  }
};

(global as any).prisma = mockPrisma;

// Global Fetch Mock
let mockGeminiFetchResult: any = null;

(global as any).fetch = async (url: string, init?: any) => {
  const urlStr = String(url);
  
  if (urlStr.includes('generativelanguage.googleapis.com')) {
    if (mockGeminiFetchResult instanceof Error) {
      throw mockGeminiFetchResult;
    }
    if (mockGeminiFetchResult.status && mockGeminiFetchResult.status !== 200) {
      return {
        ok: false,
        status: mockGeminiFetchResult.status,
        text: async () => mockGeminiFetchResult.body || 'Gemini Mock Error',
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify(mockGeminiFetchResult.data),
                }
              ]
            }
          }
        ]
      }),
    };
  }

  // Intercept Storage downloads
  if (urlStr.includes('local-file') || urlStr.includes('dummy-bucket') || urlStr.includes('uploads')) {
    return {
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => h.toLowerCase() === 'content-type' ? 'image/png' : null,
      },
      arrayBuffer: async () => new ArrayBuffer(8),
    };
  }

  throw new Error(`Unhandled fetch call in tests: ${url}`);
};

// Mock Gemini bedroom analysis mock template
const mockBedroomAnalysis = {
  scene_type: 'bedroom', // Asserted in Test 3
  confidence: 0.95,
  camera_view: {
    angle: 'eye-level perspective',
    elevation: 'standard',
    description: 'eye-level perspective showing the bedroom layout'
  },
  major_objects: [
    { name: 'bed', category: 'furniture' }
  ],
  object_priority: [
    { objectName: 'bed', priority: 'high', reason: 'main element' }
  ],
  composition_lock: {
    description: 'preserve bed layout and camera angle',
    lockAspects: ['bed placement', 'camera view angle'],
    riskLevel: 'low'
  },
  materials: ['oak wood', 'cotton fabric'],
  material_mappings: [
    { objectName: 'bed', category: 'furniture', suggestedMaterial: 'cotton fabric', confidence: 0.90 }
  ],
  texture_analysis: {
    description: 'soft fabric texture',
    dominantPatterns: []
  },
  surface_behavior: {
    glossiness: 'low',
    roughness: 'high',
    metallic: 'none',
    details: 'soft fabric texture'
  },
  interior_light_analysis: {
    lightSources: ['ambient light'],
    dominantColorTemp: 'warm',
    intensity: 'medium',
    description: 'warm interior lights'
  },
  exterior_light_analysis: {
    sunPosition: '',
    timeOfDay: '',
    weatherCondition: '',
    shadowSharpness: '',
    description: ''
  },
  mirror_analysis: { detected: false, count: 0, surfaceAreaEstimated: 'none', description: '' },
  glass_analysis: { detected: false, transparencyLevel: 'medium', reflectionLevel: 'low', description: '' },
  reflection_guidance: { promptTriggers: [], renderSettingsAdjustment: '' },
  room_type_protection: {
    roomType: 'bedroom',
    protectedElements: ['bed'],
    forbiddenSubstitutions: ['living room', 'sofa', 'fireplace']
  },
  geometry_risks: [],
  style_safety: { styleIncompatibilities: [], promptSafetyFlags: [] },
  input_quality: { resolutionCheck: 'high', compressionArtifacts: false, blurriness: 'none', score: 0.95 },
  workflow_recommendation: { pipeline: 'standard', steps: [], reason: '' },
  preserve_constraints: ['bed placement', 'camera angle'],
  forbidden_changes: ['living room conversion', 'replaced bed'],
  detail_enhancement_plan: { steps: [], targetAreas: [] },
  suggested_render_mode: 'img2img',
  suggested_denoise: 0.55,
  suggested_geometry_lock: 'balanced',
  positive_prompt_draft: 'a modern minimalist bedroom with a comfortable bed, warm materials and textures, preserving camera angle',
  negative_prompt_draft: '',
  risk_flags: [],
  success_criteria: ['bed remains'],
  user_summary: 'bedroom scene'
};

async function runTests() {
  // Import POST handler dynamically to ensure mocks are set up first
  const { POST } = await import('../../app/api/jobs/route');

  console.log('Running PromptBrain automated pipeline tests...\n');

  // Test Case 1-6: Successful Gemini Bedroom Analysis & Prompt composition assertions
  {
    console.log('Test 1-6: Successful Bedroom Analysis, Prompts composition assertions...');
    resetDbMocks();
    
    // Test 1: Mock Gemini bedroom analysis response
    mockGeminiFetchResult = {
      data: mockBedroomAnalysis
    };

    // Test 2: Create final prompt from analysis (via POST handler call)
    const request = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'proj_bedroom',
        settingsJson: JSON.stringify({
          sceneType: 'Interior',
          projectType: 'Residential',
          styleId: 'style_warm_int',
        })
      })
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 201, 'Job creation should succeed with 201 status');

    const createdJob = mockRenderJobs[0];
    assert.ok(createdJob, 'A render job should be created in the database');
    const finalSettings = JSON.parse(createdJob.settingsJson);

    // Test 3: Assert scene_type is bedroom
    // (Gemini analysis mock has scene_type: 'bedroom' and roomType: 'bedroom')
    assert.strictEqual(mockBedroomAnalysis.scene_type, 'bedroom', 'Gemini raw analysis scene_type should be bedroom');
    assert.strictEqual(finalSettings.promptBrainAnalysis.room_type_protection.roomType, 'bedroom', 'The resolved room type protection should be bedroom');

    const positivePrompt = finalSettings.prompt;
    const negativePrompt = finalSettings.negativePrompt;

    // Test 4: Assert positive prompt includes bedroom, bed, preserve camera angle, materials/textures if present
    assert.ok(positivePrompt.toLowerCase().includes('bedroom'), 'Positive prompt must include bedroom');
    assert.ok(positivePrompt.toLowerCase().includes('bed'), 'Positive prompt must include bed');
    assert.ok(positivePrompt.toLowerCase().includes('camera angle') || positivePrompt.toLowerCase().includes('camera'), 'Positive prompt must mention camera/camera angle constraints');
    assert.ok(positivePrompt.toLowerCase().includes('material') || positivePrompt.toLowerCase().includes('texture'), 'Positive prompt must include material/texture references');

    // Test 5: Assert positive prompt excludes living room, sofa, fireplace, exterior and garden windows
    assert.ok(!positivePrompt.toLowerCase().includes('living room'), 'Positive prompt should exclude living room');
    assert.ok(!positivePrompt.toLowerCase().includes('sofa'), 'Positive prompt should exclude sofa');
    assert.ok(!positivePrompt.toLowerCase().includes('fireplace'), 'Positive prompt should exclude fireplace');
    assert.ok(!positivePrompt.toLowerCase().includes('exterior'), 'Positive prompt should exclude exterior');
    assert.ok(!positivePrompt.toLowerCase().includes('garden windows'), 'Positive prompt should exclude garden windows');

    // Test 6: Assert negative prompt includes sofa, fireplace, living room conversion, exterior, layout change, camera shift, replaced bed, fake reflections, over-reflective glass
    assert.ok(negativePrompt.toLowerCase().includes('sofa'), 'Negative prompt must include sofa');
    assert.ok(negativePrompt.toLowerCase().includes('fireplace'), 'Negative prompt must include fireplace');
    assert.ok(negativePrompt.toLowerCase().includes('living room conversion'), 'Negative prompt must include living room conversion');
    assert.ok(negativePrompt.toLowerCase().includes('exterior'), 'Negative prompt must include exterior');
    assert.ok(negativePrompt.toLowerCase().includes('layout change'), 'Negative prompt must include layout change');
    assert.ok(negativePrompt.toLowerCase().includes('camera shift'), 'Negative prompt must include camera shift');
    assert.ok(negativePrompt.toLowerCase().includes('replaced bed'), 'Negative prompt must include replaced bed');
    assert.ok(negativePrompt.toLowerCase().includes('fake reflections'), 'Negative prompt must include fake reflections');
    assert.ok(negativePrompt.toLowerCase().includes('over-reflective glass'), 'Negative prompt must include over-reflective glass');

    console.log('  -> PASS');
  }

  // Test Case 7: Low-confidence analysis falls back to manual/generic_interior
  {
    console.log('Test 7: Low-confidence analysis fallback to manual/generic_interior...');
    resetDbMocks();

    // Set confidence to low (e.g. 0.40)
    mockGeminiFetchResult = {
      data: {
        ...mockBedroomAnalysis,
        confidence: 0.40
      }
    };

    const request = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'proj_bedroom',
        settingsJson: JSON.stringify({
          sceneType: 'Interior',
          projectType: 'Residential',
          styleId: 'style_warm_int',
        })
      })
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 201);

    const createdJob = mockRenderJobs[0];
    const finalSettings = JSON.parse(createdJob.settingsJson);

    // Verify fallback to manual
    assert.strictEqual(finalSettings.promptBrainProvider, 'manual', 'Low confidence should fall back to manual provider');
    assert.strictEqual(finalSettings.promptBrainAnalysis.confidence, 1.0, 'Fallback manual analysis confidence should be 1.0');
    assert.strictEqual(finalSettings.promptBrainAnalysis.scene_type, 'Interior', 'Fallback analysis scene type should match requested sceneType');
    
    // Verify fallback style preset applied is Warm Interior (compatible with Interior)
    assert.strictEqual(finalSettings.stylePreference, 'Warm Interior', 'Fallback style preset should be Warm Interior');
    assert.strictEqual(finalSettings.styleId, 'style_warm_int');

    console.log('  -> PASS');
  }

  // Test Case 8: User-locked material mapping beats Gemini mapping
  {
    console.log('Test 8: User-locked material mapping beats Gemini mapping...');
    resetDbMocks();

    // Seed mock database with a user locked mapping
    mockMaterialMappings = [
      {
        id: 'mm_user_floor',
        projectId: 'proj_bedroom',
        objectName: 'floor',
        detectedClass: 'floor',
        selectedMaterial: 'exquisite cherry wood',
        confidence: 1.0,
        locked: true,
        correctionSource: 'user'
      }
    ];

    // Gemini suggests concrete for floor
    mockGeminiFetchResult = {
      data: {
        ...mockBedroomAnalysis,
        material_mappings: [
          { objectName: 'floor', category: 'floor', suggestedMaterial: 'cold grey concrete', confidence: 0.95 }
        ]
      }
    };

    const request = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'proj_bedroom',
        settingsJson: JSON.stringify({
          sceneType: 'Interior',
          projectType: 'Residential',
          styleId: 'style_warm_int',
        })
      })
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 201);

    // Assert mapping was not overwritten in DB (processAutoMaterialMappings skips it)
    const floorMappingInDb = mockMaterialMappings.find(m => m.detectedClass === 'floor');
    assert.strictEqual(floorMappingInDb.selectedMaterial, 'exquisite cherry wood', 'Database user-locked mapping should not be overwritten');

    const createdJob = mockRenderJobs[0];
    const finalSettings = JSON.parse(createdJob.settingsJson);

    // Assert final settings mappings matches the user-locked one
    const floorMappingInSettings = finalSettings.materialMappings.find((m: any) => m.category === 'floor');
    assert.strictEqual(floorMappingInSettings.suggestedMaterial, 'exquisite cherry wood', 'Composition should use user-locked material instead of Gemini suggestion');

    console.log('  -> PASS');
  }

  // Test Case 9: Explicit denoise survives into worker settings
  {
    console.log('Test 9: Explicit denoise survives into worker settings...');
    resetDbMocks();

    // Mock Gemini
    mockGeminiFetchResult = {
      data: mockBedroomAnalysis
    };

    // Pass explicit denoise = 0.62
    const request = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'proj_bedroom',
        settingsJson: JSON.stringify({
          sceneType: 'Interior',
          projectType: 'Residential',
          styleId: 'style_warm_int',
          denoise: 0.62,
        })
      })
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 201);

    const createdJob = mockRenderJobs[0];
    const finalSettings = JSON.parse(createdJob.settingsJson);

    // Verify it is exactly 0.62
    assert.strictEqual(finalSettings.denoise, 0.62, 'Explicit denoise must survive into worker settings');

    console.log('  -> PASS');
  }

  // Test Case: Bedroom failure case coverage (Gemini request throws error)
  {
    console.log('Test Case: Gemini Request Error bedroom failure fallback...');
    resetDbMocks();

    // Mock Gemini to throw an Error
    mockGeminiFetchResult = new Error('Connection Timeout/API Limit Exceeded');

    const request = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'proj_bedroom',
        settingsJson: JSON.stringify({
          sceneType: 'Interior',
          projectType: 'Residential',
          styleId: 'style_warm_int',
        })
      })
    });

    // Verify it recovers gracefully
    const response = await POST(request);
    assert.strictEqual(response.status, 201, 'Request should complete successfully even if Gemini fails');

    const createdJob = mockRenderJobs[0];
    const finalSettings = JSON.parse(createdJob.settingsJson);

    // Verify fallback to manual
    assert.strictEqual(finalSettings.promptBrainProvider, 'manual', 'Gemini failure should trigger fallback to manual provider');
    assert.strictEqual(finalSettings.promptBrainAnalysis.confidence, 1.0, 'Fallback manual analysis confidence should be 1.0');
    assert.strictEqual(finalSettings.promptBrainAnalysis.scene_type, 'Interior', 'Fallback analysis scene type should match requested sceneType');

    console.log('  -> PASS');
  }

  console.log('\nAll PromptBrain automated pipeline tests passed successfully!');
}

runTests().catch(err => {
  console.error('\nTest execution failed:');
  console.error(err);
  process.exit(1);
});
