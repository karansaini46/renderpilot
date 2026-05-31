"use client";

import React, { useState, useEffect } from "react";
import { 
  Server, 
  HardDrive, 
  Cpu, 
  Layers, 
  Settings, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  FolderOpen, 
  Terminal, 
  ArrowRight, 
  Clock, 
  Sparkles, 
  Plus, 
  RefreshCw, 
  FileCode,
  Check,
  AlertCircle
} from "lucide-react";

// Mock initial projects
const INITIAL_PROJECTS = [
  { id: "proj_1", name: "Scandinavian Living Room", lastActive: "2026-05-31 16:30", sourceFile: "living_room_v4.blend", renderingProfile: "Interior Photorealistic" },
  { id: "proj_2", name: "Modernist Concrete Villa", lastActive: "2026-05-30 11:20", sourceFile: "exterior_main.blend", renderingProfile: "Daylight Exterior" },
  { id: "proj_3", name: "Glass Pavillion Concept", lastActive: "2026-05-28 09:15", sourceFile: "pavillion_structure.blend", renderingProfile: "Clay Concept Wireframe" },
];

// Presets for the architectural visualization pipeline
const PIPELINE_PRESETS = [
  { id: "style_mod_lux_ext", name: "Modern Luxury Exterior", model: "SD 1.5 (Arch-Refined)", controlnet: "Depth", steps: 30, cfg: 7.5 },
  { id: "style_warm_lux_int", name: "Warm Luxury Interior", model: "SD 1.5 (Arch-Refined)", controlnet: "Depth", steps: 28, cfg: 7.0 },
  { id: "style_min_white", name: "Minimal White Concept", model: "SD 1.5 (Clay-Base)", controlnet: "None", steps: 20, cfg: 6.5 },
  { id: "style_trop_villa", name: "Tropical Villa", model: "SD 1.5 (Landscape-v2)", controlnet: "Canny Edge", steps: 30, cfg: 8.0 },
  { id: "style_night_ext", name: "Night Exterior", model: "SD 1.5 (Night-Refined)", controlnet: "Depth", steps: 35, cfg: 8.0 },
  { id: "style_real_estate", name: "Real Estate Bright", model: "SD 1.5 (Landscape-v2)", controlnet: "Canny Edge", steps: 25, cfg: 7.0 },
];

export default function Dashboard() {
  // State variables for interactive UI demo
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [selectedProjectId, setSelectedProjectId] = useState("proj_1");
  const [selectedPresetId, setSelectedPresetId] = useState("style_mod_lux_ext");
  const [prompt, setPrompt] = useState("modern luxury concrete and glass villa, cantilevered balconies, infinity pool reflecting warm glowing architectural lights, sunset sky, landscaped garden, architectural digest photography");
  const [negativePrompt, setNegativePrompt] = useState("deformed, lowres, blurry, bad lighting, text, logo, watermark");
  
  // VRAM monitoring simulation (4GB RTX 3050 threshold)
  const [vramUsage, setVramUsage] = useState(1.8); // GB
  const [isVramWarning, setIsVramWarning] = useState(false);
  const [batchSize, setBatchSize] = useState(1);
  const [controlnetCount, setControlnetCount] = useState(1);

  // Active rendering simulation state
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [activeStep, setActiveStep] = useState("");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  
  // Connection states (mocking local API endpoints)
  const [apiOnline, setApiOnline] = useState(true);
  const [comfyOnline, setComfyOnline] = useState(false);
  const [blenderFound, setBlenderFound] = useState(true);

  // Monitor hardware configuration constraints
  useEffect(() => {
    // If user increases batch size or adds controlnets, warn them of local hardware thresholds
    if (batchSize > 1 || controlnetCount > 1) {
      setIsVramWarning(true);
      setVramUsage(3.8); // Simulates pushing the limit
    } else {
      setIsVramWarning(false);
      setVramUsage(selectedPresetId === "style_min_white" ? 1.4 : 2.2);
    }
  }, [batchSize, controlnetCount, selectedPresetId]);

  const activeProject = projects.find(p => p.id === selectedProjectId) || projects[0];
  const activePreset = PIPELINE_PRESETS.find(p => p.id === selectedPresetId) || PIPELINE_PRESETS[0];

  // Run mock visualization pipeline
  const handleTriggerRender = () => {
    if (isRendering) return;
    setIsRendering(true);
    setRenderProgress(0);
    setConsoleLogs([]);
    
    const logs = [
      "Initializing RenderPilot workflow run...",
      `Checking SQLite registry for project metadata: ${activeProject.name}`,
      "Checking local environment variables...",
      "Launching Blender subprocess headlessly...",
      `Executing scene script on file: ${activeProject.sourceFile}`,
      "Render output directory verified: storage/projects/outputs/",
      "Blender pass complete: Exported wireframe/depth map to temporary folder.",
      "Connecting to local ComfyUI instance API...",
      "Verifying Stable Diffusion checkpoint in storage/models...",
      `Injecting parameters: Batch Size = ${batchSize}, CFG = ${activePreset.cfg}, Steps = ${activePreset.steps}`,
      `Selected ControlNet: ${activePreset.controlnet} (1 layer limit validated)`,
      "Queueing generation request in local ComfyUI queue...",
      "ComfyUI Worker: Fetching noise tensors...",
      "ComfyUI Worker: Running denoise loop (Batch 1/1)...",
      "ComfyUI Worker: Decoding VAE outputs to numpy arrays...",
      `Output frame written to storage/outputs/${activeProject.id}_render.png`,
      "SQLite registry updated successfully.",
      "Visualization pipeline execution complete."
    ];

    let currentLogIndex = 0;
    const interval = setInterval(() => {
      if (currentLogIndex < logs.length) {
        setConsoleLogs(prev => [...prev, logs[currentLogIndex]]);
        setActiveStep(logs[currentLogIndex]);
        setRenderProgress(Math.round(((currentLogIndex + 1) / logs.length) * 100));
        currentLogIndex++;
      } else {
        clearInterval(interval);
        setIsRendering(false);
        setActiveStep("Ready");
      }
    }, 450);
  };


  return (
    <div className="min-h-screen p-6 flex flex-col justify-between">
      
      {/* Header Info */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-brand-500 to-purple-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <span className="text-white font-bold text-sm tracking-wider font-display">RP</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight font-display">
              Render<span className="brand-gradient-text">Pilot</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 font-medium">
              VRAM Safeguard Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Local-first architectural visualization orchestration console
          </p>
        </div>

        {/* Integration Status Flags */}
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800">
            <span className={`h-1.5 w-1.5 rounded-full ${apiOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
            <span className="text-slate-300">FastAPI Server: {apiOnline ? 'Online' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800">
            <span className={`h-1.5 w-1.5 rounded-full ${blenderFound ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
            <span className="text-slate-300">Blender: {blenderFound ? 'Found' : 'Not Configured'}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800">
            <span className={`h-1.5 w-1.5 rounded-full ${comfyOnline ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
            <span className="text-slate-300">ComfyUI: {comfyOnline ? 'Connected' : 'Offline (Awaiting Local App)'}</span>
            <button 
              onClick={() => setComfyOnline(!comfyOnline)} 
              className="text-[10px] text-brand-400 hover:text-brand-300 underline font-medium ml-1 transition-all"
            >
              Simulate Dev Connection
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        
        {/* Left Column: Config Panel (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* VRAM / Hardware Monitor Card */}
          <div className="glass-panel rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-brand-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300 flex items-center gap-2 font-display">
                <Cpu className="h-4 w-4 text-brand-400" />
                RTX 3050 hardware limiter
              </h2>
              <span className="text-xs text-slate-400">Total VRAM: 4.0 GB</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span>VRAM Allocation Estimate</span>
                <span className={`font-bold ${isVramWarning ? 'text-rose-400' : 'text-brand-400'}`}>
                  {vramUsage.toFixed(1)} GB / 4.0 GB
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ease-in-out ${
                    isVramWarning 
                      ? 'bg-gradient-to-r from-rose-500 to-amber-500' 
                      : 'bg-gradient-to-r from-brand-500 to-purple-500'
                  }`}
                  style={{ width: `${(vramUsage / 4.0) * 100}%` }}
                />
              </div>

              {isVramWarning ? (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex gap-2.5 items-start mt-2">
                  <AlertTriangle className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-300">
                    <p className="font-semibold">VRAM Limit Alert</p>
                    <p className="mt-0.5">Increasing batch size or piling multiple ControlNets on a 4GB card will trigger stable diffusion crashes. Reset parameter limits to guarantee pipeline safety.</p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex gap-2.5 items-start mt-2">
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <p className="font-semibold text-emerald-400">Hardware Profile Safe</p>
                    <p className="mt-0.5 text-slate-400">Settings optimal. Pipeline restricted to batch size 1 and SD 1.5 base checkpoint configuration.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Workflow Parameters Panel */}
          <div className="glass-panel rounded-xl p-5 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300 flex items-center justify-between font-display">
                <span>Rendering presets</span>
                <Settings className="h-4 w-4 text-slate-400" />
              </h2>

              {/* Preset Selector */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">Visualization Profile Preset</label>
                <div className="grid grid-cols-1 gap-2">
                  {PIPELINE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        if (preset.id === "style_warm_lux_int") {
                          setPrompt("luxury warm living room interior, oak wood paneling, travertine marble fireplace, bouclé fabric sofa, soft ambient lighting, high ceilings, large windows looking out to a garden, premium furniture, cozy mood");
                        } else if (preset.id === "style_min_white") {
                          setPrompt("conceptual architectural model, minimalist white matte surfaces, clean sharp shadows, geometric grid lines, studio lighting background, pure white and soft grey tones, sharp contours, wireframe details");
                        } else if (preset.id === "style_trop_villa") {
                          setPrompt("open-air tropical architectural pavilion, teak wood pillars, thatched bamboo detailing, surrounded by lush palm trees, volcanic stone pathways, bright sunny daylight, cinematic volumetric fog");
                        } else if (preset.id === "style_night_ext") {
                          setPrompt("contemporary smart home architecture at twilight, glowing led outline trim, warm interior light showing through floor-to-ceiling glass panes, starry night sky, wet concrete driveway reflections, moody lighting");
                        } else if (preset.id === "style_real_estate") {
                          setPrompt("professional real estate exterior photograph, bright daylight, wide-angle-lens, clean manicured lawn, fresh paint, crystal clear blue sky, inviting front facade");
                        } else {
                          setPrompt("modern luxury concrete and glass villa, cantilevered balconies, infinity pool reflecting warm glowing architectural lights, sunset sky, landscaped garden, architectural digest photography");
                        }
                      }}
                      className={`p-3 text-left rounded-lg border text-xs transition-all flex justify-between items-center ${
                        selectedPresetId === preset.id
                          ? 'bg-brand-500/10 border-brand-500/40 text-brand-300'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{preset.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Model: {preset.model} | Control: {preset.controlnet}</p>
                      </div>
                      {selectedPresetId === preset.id && <Check className="h-4 w-4 text-brand-400" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Core Pipeline Prompts */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">Prompt</label>
                  <textarea
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500 font-sans resize-none"
                    placeholder="Describe your design aesthetics..."
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">Negative Prompt</label>
                  <input
                    type="text"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500 font-sans"
                    placeholder="Features to avoid..."
                  />
                </div>
              </div>

              {/* Hardware Protection Config Controls */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-900">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">Batch Size</label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={batchSize}
                      onChange={(e) => setBatchSize(Number(e.target.value))}
                      className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                    >
                      <option value={1}>1 (Safe)</option>
                      <option value={2}>2 (VRAM Danger)</option>
                      <option value={4}>4 (Not Recommended)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">ControlNet Layers</label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={controlnetCount}
                      onChange={(e) => setControlnetCount(Number(e.target.value))}
                      className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                    >
                      <option value={1}>1 (Depth/Canny)</option>
                      <option value={2}>2 (High VRAM Load)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleTriggerRender}
              disabled={isRendering}
              className={`w-full mt-4 p-3 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold tracking-wider uppercase transition-all duration-300 ${
                isRendering 
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700' 
                  : 'bg-gradient-to-r from-brand-500 to-purple-600 text-white shadow-md shadow-brand-500/20 hover:scale-[1.01] hover:brightness-110 active:scale-95'
              }`}
            >
              {isRendering ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Generating Architectural Pass...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current text-white" />
                  Trigger Rendering Engine
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Project Explorer & Running Progress (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Projects Panel */}
          <div className="glass-panel rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300 flex items-center gap-2 font-display">
                <FolderOpen className="h-4 w-4 text-brand-400" />
                Local projects explorer
              </h2>
              <button className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1 transition-all">
                <Plus className="h-3.5 w-3.5" />
                New Project
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProjectId(proj.id)}
                  className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all glass-panel-hover ${
                    selectedProjectId === proj.id 
                      ? 'border-brand-500 bg-slate-900/90 shadow-md shadow-brand-500/5' 
                      : 'border-slate-800 bg-slate-900/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <FileCode className={`h-5 w-5 ${selectedProjectId === proj.id ? 'text-brand-400' : 'text-slate-500'}`} />
                    <span className="text-[9px] text-slate-500">{proj.lastActive}</span>
                  </div>
                  <p className="font-semibold text-xs text-slate-200 mt-2.5 truncate">{proj.name}</p>
                  <p className="text-[10px] text-slate-500 mt-1 truncate">{proj.sourceFile}</p>
                  <div className="mt-3 pt-2 border-t border-slate-900/60 flex items-center justify-between">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 truncate max-w-[90%]">
                      {proj.renderingProfile}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Console / Pipeline Step Runner */}
          <div className="glass-panel rounded-xl p-5 flex-1 flex flex-col justify-between min-h-[350px]">
            <div>
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300 flex items-center gap-2 font-display">
                  <Terminal className="h-4 w-4 text-brand-400" />
                  Automation process console
                </h2>
                {isRendering && (
                  <span className="text-xs text-brand-400 flex items-center gap-1.5 animate-pulse">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Running Step
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span className="truncate max-w-[80%] font-mono">Current: {activeStep || "Awaiting execution trigger..."}</span>
                  <span className="font-bold">{renderProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-brand-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${renderProgress}%` }}
                  />
                </div>
              </div>

              {/* Console log window */}
              <div className="w-full h-[220px] bg-slate-950/80 rounded-lg p-3 border border-slate-900 font-mono text-[10px] text-slate-400 overflow-y-auto space-y-1.5 leading-relaxed">
                {consoleLogs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                    Console idle. Click "Trigger Rendering Engine" to execute mock process.
                  </div>
                ) : (
                  consoleLogs.map((log, i) => (
                    <div key={i} className={`flex gap-2 ${i === consoleLogs.length - 1 ? 'text-brand-300' : 'text-slate-400'}`}>
                      <span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span>
                      <span>{log}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Simulated generation output preview */}
            <div className="mt-4 pt-4 border-t border-slate-900 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded border border-slate-800 bg-slate-900 flex items-center justify-center text-slate-600 text-xs font-bold overflow-hidden">
                  {renderProgress === 100 ? (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center text-[10px] text-emerald-400">PNG</div>
                  ) : (
                    "CAD"
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    {renderProgress === 100 ? `${activeProject.id}_render.png` : activeProject.sourceFile}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {renderProgress === 100 
                      ? "Saved: storage/outputs/" 
                      : `Location: storage/projects/${activeProject.id}/`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right hidden md:block">
                  <p className="text-[10px] text-slate-500">Active Workflow Preset</p>
                  <p className="text-xs font-semibold text-slate-300">{activePreset.name}</p>
                </div>
                <ArrowRight className="h-4.5 w-4.5 text-slate-600 hidden md:block" />
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Estimated Duration</p>
                  <p className="text-xs font-semibold text-brand-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {selectedPresetId === "clay_concept" ? "~12 seconds" : "~35 seconds"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* Footer System Spec Details */}
      <footer className="mt-6 pt-4 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-3 text-[10px] text-slate-500">
        <p>© 2026 RenderPilot - Dedicated Windows Local Render Orchestrator</p>
        <div className="flex gap-4">
          <span>Project Database: SQLite (storage/renderpilot.db)</span>
          <span>Blender: Headless process runner</span>
          <span>GPU Profile: NVIDIA RTX 3050 (4GB) Safe Limit config active</span>
        </div>
      </footer>

    </div>
  );
}
