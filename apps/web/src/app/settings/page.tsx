'use client';

import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Database, 
  HardDrive, 
  Cpu, 
  Save, 
  Check, 
  Sliders 
} from 'lucide-react';

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
  
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Simulate API delay
    setTimeout(() => {
      setIsSaving(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }, 600);
  };

  return (
    <div className="space-y-8 relative">
      {/* Toast Alert Notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2 bg-emerald-500 text-slate-950 px-4 py-3 rounded-lg shadow-xl font-semibold text-sm transition-all duration-300 animate-bounce">
          <Check className="h-4.5 w-4.5" />
          <span>Configuration saved successfully!</span>
        </div>
      )}

      {/* Header section */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-400 bg-clip-text text-transparent">
          System Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure connection endpoints, storage buckets, and rendering paths.
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
    </div>
  );
}
