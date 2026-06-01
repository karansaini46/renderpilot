'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings as SettingsIcon, 
  Database, 
  HardDrive, 
  Cpu, 
  Save, 
  Check, 
  Sliders,
  Shield,
  AlertTriangle,
  Loader2
} from 'lucide-react';

interface CapacityProfile {
  max_concurrent_jobs: number;
  max_preview_resolution: number;
  max_variations_per_job: number;
  sequential_variations: boolean;
  sdxl_enabled: boolean;
  video_enabled: boolean;
  parallel_comfyui_jobs: boolean;
  upscale_approved_only: boolean;
}

const DEFAULT_CAPACITY: CapacityProfile = {
  max_concurrent_jobs: 1,
  max_preview_resolution: 768,
  max_variations_per_job: 4,
  sequential_variations: true,
  sdxl_enabled: false,
  video_enabled: false,
  parallel_comfyui_jobs: false,
  upscale_approved_only: true,
};

export default function Settings() {
  const [dbUrl, setDbUrl] = useState('postgresql://neondb_owner:***@ep-fancy-river.neon.tech/neondb?sslmode=require');
  
  // Storage states
  const [storageProvider, setStorageProvider] = useState('s3');
  const [storageBucket, setStorageBucket] = useState('renderpilot-storage');
  const [storagePublicUrl, setStoragePublicUrl] = useState('https://renderpilot-storage.s3.eu-north-1.amazonaws.com');
  const [awsRegion, setAwsRegion] = useState('eu-north-1');

  // Worker node settings
  const [workerId, setWorkerId] = useState('laptop_node_01');
  const [workerName, setWorkerName] = useState('Laptop Workstation 01');
  const [comfyuiUrl, setComfyuiUrl] = useState('http://127.0.0.1:8188');
  const [blenderPath, setBlenderPath] = useState('C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe');
  
  // Capacity guardrails state
  const [capacity, setCapacity] = useState<CapacityProfile>(DEFAULT_CAPACITY);
  const [capacityLoading, setCapacityLoading] = useState(true);
  const [capacitySaving, setCapacitySaving] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Configuration saved successfully!');

  // Fetch current capacity profile on mount
  const fetchCapacity = useCallback(async () => {
    try {
      const res = await fetch(`/api/workers/capacity?workerId=${encodeURIComponent(workerId)}`);
      if (res.ok) {
        const data = await res.json();
        setCapacity(data);
      }
    } catch (err) {
      console.error('Failed to fetch capacity profile:', err);
    } finally {
      setCapacityLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    fetchCapacity();
  }, [fetchCapacity]);

  const showSuccessToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      showSuccessToast('Configuration saved successfully!');
    }, 600);
  };

  const handleSaveCapacity = async () => {
    setCapacitySaving(true);
    try {
      const res = await fetch('/api/workers/capacity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId, capacity }),
      });
      if (res.ok) {
        showSuccessToast('Capacity guardrails updated successfully!');
      } else {
        const err = await res.json();
        showSuccessToast(`Error: ${err.error || 'Failed to save'}`);
      }
    } catch (err) {
      console.error('Failed to save capacity:', err);
    } finally {
      setCapacitySaving(false);
    }
  };

  const updateCapacity = (key: keyof CapacityProfile, value: number | boolean) => {
    setCapacity(prev => ({ ...prev, [key]: value }));
  };

  // Toggle switch component
  const ToggleSwitch = ({ enabled, onChange, label, description, dangerous = false }: {
    enabled: boolean;
    onChange: (val: boolean) => void;
    label: string;
    description: string;
    dangerous?: boolean;
  }) => (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200">{label}</span>
          {dangerous && enabled && (
            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
          )}
        </div>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`
          relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out cursor-pointer
          ${enabled
            ? dangerous ? 'bg-amber-500' : 'bg-indigo-500'
            : 'bg-slate-700'
          }
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg
            transform transition-transform duration-200 ease-in-out
            ${enabled ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );

  return (
    <div className="space-y-8 relative">
      {/* Toast Alert Notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2 bg-emerald-500 text-slate-950 px-4 py-3 rounded-lg shadow-xl font-semibold text-sm transition-all duration-300 animate-bounce">
          <Check className="h-4.5 w-4.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header section */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-400 bg-clip-text text-transparent">
          System Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure connection endpoints, storage buckets, rendering paths, and capacity guardrails.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        
        {/* Section 1: Database configurations */}
        <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-900">
            <Database className="h-5 w-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Cloud Brain Database</h2>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-2">
              Neon PostgreSQL Connection URI (Read-only on client)
            </label>
            <input 
              type="text" 
              readOnly
              value={dbUrl}
              className="w-full bg-slate-950/60 border border-slate-900 rounded-lg px-4 py-2.5 text-xs text-slate-400 cursor-not-allowed focus:outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1.5">For security, database connection parameters must be defined as server environment secrets.</p>
          </div>
        </div>

        {/* Section 2: Object storage configurations */}
        <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-900">
            <HardDrive className="h-5 w-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">S3-Compatible Object Storage</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                Storage Provider
              </label>
              <select
                value={storageProvider}
                onChange={(e) => setStorageProvider(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-xs text-slate-200 transition-all"
              >
                <option value="s3">AWS S3 compatible</option>
                <option value="cloudflare_r2">Cloudflare R2</option>
                <option value="backblaze_b2">Backblaze B2</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                Storage Bucket Name
              </label>
              <input 
                type="text" 
                required
                value={storageBucket}
                onChange={(e) => setStorageBucket(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-xs text-slate-200 transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                Public Gateway URL
              </label>
              <input 
                type="text" 
                required
                value={storagePublicUrl}
                onChange={(e) => setStoragePublicUrl(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-xs text-slate-200 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                AWS Region
              </label>
              <input 
                type="text" 
                required
                value={awsRegion}
                onChange={(e) => setAwsRegion(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-xs text-slate-200 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Worker Node and Tooling paths */}
        <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-900">
            <Cpu className="h-5 w-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Laptop Worker & Local Tools</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                Worker Node ID
              </label>
              <input 
                type="text" 
                required
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-xs text-slate-200 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                Worker Display Name
              </label>
              <input 
                type="text" 
                required
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-xs text-slate-200 transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                ComfyUI API Server URL
              </label>
              <input 
                type="text" 
                required
                value={comfyuiUrl}
                onChange={(e) => setComfyuiUrl(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-xs text-slate-200 transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                Blender Executable Path
              </label>
              <input 
                type="text" 
                required
                value={blenderPath}
                onChange={(e) => setBlenderPath(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-xs text-slate-200 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-sm font-semibold px-6 py-3 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all active:scale-95 disabled:opacity-50"
          >
            <Save className="h-4.5 w-4.5" />
            <span>{isSaving ? 'Saving Configurations...' : 'Save Configurations'}</span>
          </button>
        </div>

      </form>

      {/* Section 4: Capacity Guardrails — separate from the main form */}
      <div className="max-w-4xl space-y-6">
        <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-900">
            <div className="flex items-center space-x-2.5">
              <Shield className="h-5 w-5 text-indigo-400" />
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Capacity Guardrails</h2>
            </div>
            <span className="text-[9px] font-bold text-indigo-400/60 uppercase tracking-widest bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/15">
              Laptop Profile
            </span>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            These limits prevent VRAM exhaustion and thermal throttling on consumer GPU hardware.
            Jobs requesting resources beyond these limits will be automatically downshifted or flagged for manual review.
          </p>

          {capacityLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
              <span className="text-xs text-slate-400 ml-2">Loading capacity profile...</span>
            </div>
          ) : (
            <>
              {/* Numeric limits */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950/40 rounded-lg p-4 border border-slate-900/60 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Max Concurrent Jobs
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={capacity.max_concurrent_jobs}
                      onChange={(e) => updateCapacity('max_concurrent_jobs', Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
                      className="w-20 bg-slate-900/60 border border-slate-800 focus:border-indigo-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-200 text-center font-bold transition-all"
                    />
                    <span className="text-[10px] text-slate-500">job(s) at a time</span>
                  </div>
                  <p className="text-[9px] text-slate-600">Range: 1–8</p>
                </div>

                <div className="bg-slate-950/40 rounded-lg p-4 border border-slate-900/60 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Max Preview Resolution
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min={256}
                      max={2048}
                      step={64}
                      value={capacity.max_preview_resolution}
                      onChange={(e) => updateCapacity('max_preview_resolution', Math.max(256, Math.min(2048, parseInt(e.target.value) || 768)))}
                      className="w-20 bg-slate-900/60 border border-slate-800 focus:border-indigo-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-200 text-center font-bold transition-all"
                    />
                    <span className="text-[10px] text-slate-500">px longest side</span>
                  </div>
                  <p className="text-[9px] text-slate-600">Range: 256–2048</p>
                </div>

                <div className="bg-slate-950/40 rounded-lg p-4 border border-slate-900/60 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Max Variations Per Job
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={capacity.max_variations_per_job}
                      onChange={(e) => updateCapacity('max_variations_per_job', Math.max(1, Math.min(16, parseInt(e.target.value) || 4)))}
                      className="w-20 bg-slate-900/60 border border-slate-800 focus:border-indigo-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-200 text-center font-bold transition-all"
                    />
                    <span className="text-[10px] text-slate-500">variations</span>
                  </div>
                  <p className="text-[9px] text-slate-600">Range: 1–16</p>
                </div>
              </div>

              {/* Toggle switches */}
              <div className="bg-slate-950/40 rounded-lg p-4 border border-slate-900/60 divide-y divide-slate-900/40">
                <ToggleSwitch
                  enabled={capacity.sequential_variations}
                  onChange={(val) => updateCapacity('sequential_variations', val)}
                  label="Sequential Variation Generation"
                  description="Run variation batches one at a time to prevent VRAM overflow. Disable only on high-end workstations."
                />
                <ToggleSwitch
                  enabled={capacity.upscale_approved_only}
                  onChange={(val) => updateCapacity('upscale_approved_only', val)}
                  label="Upscale Approved Images Only"
                  description="Only upscale renders that have been approved or explicitly selected. Prevents unnecessary GPU workload."
                />
                <ToggleSwitch
                  enabled={capacity.sdxl_enabled}
                  onChange={(val) => updateCapacity('sdxl_enabled', val)}
                  label="SDXL Mode"
                  description="Enable Stable Diffusion XL pipelines. Requires 12GB+ VRAM. Jobs requesting SDXL will be flagged for review if disabled."
                  dangerous
                />
                <ToggleSwitch
                  enabled={capacity.video_enabled}
                  onChange={(val) => updateCapacity('video_enabled', val)}
                  label="Video Rendering Mode"
                  description="Enable video/animation rendering pipelines. Extremely GPU-intensive. Jobs requesting video will be flagged for review if disabled."
                  dangerous
                />
                <ToggleSwitch
                  enabled={capacity.parallel_comfyui_jobs}
                  onChange={(val) => updateCapacity('parallel_comfyui_jobs', val)}
                  label="Parallel ComfyUI Workflows"
                  description="Allow multiple ComfyUI workflows to execute simultaneously. Not recommended for consumer GPUs with less than 16GB VRAM."
                  dangerous
                />
              </div>

              {/* Save capacity button */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center space-x-2 text-[10px] text-slate-600">
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Changes are applied on next worker heartbeat cycle</span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveCapacity}
                  disabled={capacitySaving}
                  className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-sm font-semibold px-5 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all active:scale-95 disabled:opacity-50"
                >
                  {capacitySaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4" />
                  )}
                  <span>{capacitySaving ? 'Saving Limits...' : 'Save Capacity Limits'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
