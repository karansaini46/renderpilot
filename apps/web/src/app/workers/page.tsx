'use client';

import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  RefreshCw, 
  Activity, 
  Terminal, 
  Monitor, 
  Clock, 
  HardDrive, 
  Play, 
  Layers,
  Loader2
} from 'lucide-react';
import Link from 'next/link';

interface Worker {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  ipAddress: string | null;
  hostname: string | null;
  lastHeartbeat: string | null;
  lastSeenAt: string | null;
  currentJobId: string | null;
  gpuName: string | null;
  vramGb: number | null;
  mode: string | null;
  settingsJson: string | null;
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchWorkers = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const res = await fetch('/api/workers');
      if (res.ok) {
        const data = await res.json();
        setWorkers(data);
      }
    } catch (err) {
      console.error('Failed to fetch workers:', err);
    } finally {
      setIsLoading(false);
      if (showRefreshing) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
    
    // Setup 4s interval polling for real-time heartbeat monitor updates
    const interval = setInterval(() => {
      fetchWorkers();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const formatRelativeTime = (timeStr: string | null) => {
    if (!timeStr) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(timeStr).getTime()) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timeStr).toLocaleDateString();
  };

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'online':
        return (
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400 capitalize">Online</span>
          </div>
        );
      case 'busy':
        return (
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.7)] animate-pulse" />
            <span className="text-xs font-semibold text-amber-400 capitalize">Busy</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-slate-600" />
            <span className="text-xs font-semibold text-slate-400 capitalize">Offline</span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-400 bg-clip-text text-transparent">
            Worker Nodes Console
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Monitor registration heartbeats, active job nodes, and GPU hardware telemetry.
          </p>
        </div>

        <button
          onClick={() => fetchWorkers(true)}
          disabled={isRefreshing}
          className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-semibold px-4.5 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all active:scale-95 disabled:opacity-50 w-fit"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {/* Stats Summary Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-4.5 rounded-xl bg-slate-900/20 border border-slate-900 flex items-center space-x-4">
          <div className="p-3 rounded bg-indigo-500/10 text-indigo-400">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Registered</span>
            <span className="text-2xl font-black text-slate-200 mt-0.5 block">{workers.length}</span>
          </div>
        </div>

        <div className="p-4.5 rounded-xl bg-slate-900/20 border border-slate-900 flex items-center space-x-4">
          <div className="p-3 rounded bg-emerald-500/10 text-emerald-400">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Online & Idle</span>
            <span className="text-2xl font-black text-slate-200 mt-0.5 block">
              {workers.filter(w => w.status === 'online').length}
            </span>
          </div>
        </div>

        <div className="p-4.5 rounded-xl bg-slate-900/20 border border-slate-900 flex items-center space-x-4">
          <div className="p-3 rounded bg-amber-500/10 text-amber-400">
            <Play className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active rendering</span>
            <span className="text-2xl font-black text-slate-200 mt-0.5 block">
              {workers.filter(w => w.status === 'busy').length}
            </span>
          </div>
        </div>
      </div>

      {/* Grid view of nodes */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
          <span className="text-xs text-slate-400 mt-3">Fetching worker telemetry...</span>
        </div>
      ) : workers.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/10 border border-slate-900 rounded-xl">
          <Cpu className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-350">No worker nodes registered</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
            Please run the private laptop workstation script to connect your node to RenderPilot queue.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {workers.map((worker) => (
            <div 
              key={worker.id}
              className="bg-slate-900/30 border border-slate-900 rounded-xl p-5 hover:border-slate-800 transition-all flex flex-col justify-between space-y-5 group relative overflow-hidden"
            >
              {/* Card top row */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-900/50 pb-4">
                <div className="flex items-center space-x-3.5">
                  <div className={`p-2.5 rounded-lg bg-slate-950 border border-slate-900 group-hover:border-indigo-500/30 transition-colors`}>
                    <Monitor className="h-5 w-5 text-indigo-400/80" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200 group-hover:text-indigo-400 transition-colors truncate max-w-[160px]" title={worker.name}>
                      {worker.name}
                    </h3>
                    <p className="text-[9px] text-slate-500 font-mono uppercase mt-0.5 tracking-wider">ID: {worker.id}</p>
                  </div>
                </div>
                {getStatusIndicator(worker.status)}
              </div>

              {/* Hardware specifications */}
              <div className="grid grid-cols-2 gap-4.5 text-xs text-slate-400">
                <div className="space-y-1 bg-slate-950/40 p-2.5 rounded border border-slate-900/50">
                  <span className="text-[9px] text-slate-500 block font-semibold uppercase tracking-wider">GPU Node</span>
                  <div className="flex items-center space-x-1.5 font-medium text-slate-300">
                    <Activity className="h-3.5 w-3.5 text-indigo-500/60 shrink-0" />
                    <span className="truncate" title={worker.gpuName || 'Unknown GPU'}>
                      {worker.gpuName || 'Unknown Hardware'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 bg-slate-950/40 p-2.5 rounded border border-slate-900/50">
                  <span className="text-[9px] text-slate-500 block font-semibold uppercase tracking-wider">Dedicated VRAM</span>
                  <div className="flex items-center space-x-1.5 font-medium text-slate-300">
                    <HardDrive className="h-3.5 w-3.5 text-indigo-500/60 shrink-0" />
                    <span>{worker.vramGb ? `${worker.vramGb} GB VRAM` : 'Unknown VRAM'}</span>
                  </div>
                </div>
              </div>

              {/* Telemetry info */}
              <div className="bg-slate-950/20 rounded-lg p-3.5 border border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 text-[11px] text-slate-450">
                <div className="flex items-center space-x-2">
                  <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span>Last seen: <span className="font-semibold text-slate-300">{formatRelativeTime(worker.lastSeenAt || worker.lastHeartbeat)}</span></span>
                </div>

                <div className="flex items-center space-x-2">
                  <Terminal className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span>Mode: <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">{worker.mode || 'idle'}</span></span>
                </div>
              </div>

              {/* Active claimed job indicator if busy */}
              {worker.status === 'busy' && worker.currentJobId && (
                <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-lg flex items-center justify-between text-xs text-indigo-400">
                  <span>Executing Job:</span>
                  <Link 
                    href={`/jobs`}
                    className="font-bold hover:underline bg-indigo-600/10 px-2.5 py-0.5 rounded border border-indigo-500/20"
                  >
                    {worker.currentJobId.replace('job_', '#')}
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
