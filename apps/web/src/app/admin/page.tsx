'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ListTodo,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Layers,
  Database,
  RefreshCw,
  Play,
  Monitor,
  Activity,
  HardDrive,
  Terminal,
  TrendingUp,
  AlertCircle,
  Zap,
  Gauge
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
}

interface ActiveJob {
  id: string;
  projectId: string;
  progress: number;
  status: string;
  createdAt: string;
  worker: { name: string } | null;
  project: { name: string } | null;
}

interface Metrics {
  queuedJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  workers: Worker[];
  activeJobs: ActiveJob[];
  averageVariationCount: number;
  cacheHitCount: number;
  upscalesRun: number;
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/metrics');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
        setError(null);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to fetch operational metrics');
      }
    } catch (err: any) {
      console.error('Failed to fetch admin metrics:', err);
      setError(err.message || 'Network error fetching metrics');
    } finally {
      setIsLoading(false);
      if (showRefreshing) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMetrics();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

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

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return '0s';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  };

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'online':
        return (
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400 capitalize">Online</span>
          </div>
        );
      case 'busy':
        return (
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.7)] animate-pulse" />
            <span className="text-xs font-semibold text-amber-400 capitalize">Busy</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-600" />
            <span className="text-xs font-semibold text-slate-400 capitalize">Offline</span>
          </div>
        );
    }
  };

  if (isLoading && !metrics) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
        <p className="text-xs text-slate-400">Loading admin telemetry dashboard...</p>
      </div>
    );
  }

  const activeWorkerCount = metrics?.workers.filter(w => w.status === 'online' || w.status === 'busy').length || 0;
  const busyWorkerCount = metrics?.workers.filter(w => w.status === 'busy').length || 0;

  return (
    <div className="space-y-8">
      {/* Top Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-950 text-indigo-400 border border-indigo-850">
              Admin console
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-400 bg-clip-text text-transparent mt-1">
            System Operations Control
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time pipeline telemetry, worker node loads, queue bottlenecks, and processing performance.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 bg-slate-900/40 border border-slate-800 rounded-lg px-3.5 py-2 text-xs font-medium text-slate-350 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span>Auto Refresh (5s)</span>
          </label>

          <button
            onClick={() => fetchMetrics(true)}
            disabled={isRefreshing}
            className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-semibold px-4 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync Telemetry</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start space-x-3 text-rose-400 text-xs">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <span className="font-bold block">Telemetry Retrieval Error</span>
            <span className="mt-0.5 block">{error}</span>
          </div>
        </div>
      )}

      {metrics && (
        <>
          {/* Load Warnings */}
          {metrics.queuedJobs > 5 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-3 text-amber-400 text-xs">
              <AlertCircle className="h-5 w-5 shrink-0 animate-bounce" />
              <div>
                <span className="font-bold block">Queue Backlog Warning</span>
                <span className="mt-0.5 block">
                  There are currently {metrics.queuedJobs} jobs waiting in the queue. Consider launching additional laptop workers to balance the load.
                </span>
              </div>
            </div>
          )}

          {/* Operational Telemetry Cards Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Queued Jobs */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4.5 flex flex-col justify-between space-y-4 group hover:border-slate-800 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Queued Jobs</span>
                <div className="p-2 rounded bg-indigo-500/10 text-indigo-400">
                  <ListTodo className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-slate-200 block">{metrics.queuedJobs}</span>
                <span className="text-[10px] text-slate-500 block mt-1">Pending allocation</span>
              </div>
            </div>

            {/* Completed Jobs */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4.5 flex flex-col justify-between space-y-4 group hover:border-slate-800 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Completed Jobs</span>
                <div className="p-2 rounded bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-slate-200 block">{metrics.completedJobs}</span>
                <span className="text-[10px] text-slate-500 block mt-1">Finished processing</span>
              </div>
            </div>

            {/* Failed Jobs */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4.5 flex flex-col justify-between space-y-4 group hover:border-slate-800 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Failed Jobs</span>
                <div className="p-2 rounded bg-rose-500/10 text-rose-400">
                  <XCircle className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-slate-200 block">{metrics.failedJobs}</span>
                <span className="text-[10px] text-slate-550 block mt-1">Errors logged</span>
              </div>
            </div>

            {/* Avg Processing Time */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4.5 flex flex-col justify-between space-y-4 group hover:border-slate-800 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Avg Processing</span>
                <div className="p-2 rounded bg-amber-500/10 text-amber-400">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-slate-200 block">
                  {formatDuration(metrics.averageProcessingTime)}
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">Per successful render</span>
              </div>
            </div>

            {/* Cache Hit Count */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4.5 flex flex-col justify-between space-y-4 group hover:border-slate-800 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cache Hit Count</span>
                <div className="p-2 rounded bg-purple-500/10 text-purple-400">
                  <Database className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-slate-200 block">{metrics.cacheHitCount}</span>
                <span className="text-[10px] text-slate-500 block mt-1">Bypassed GPU compute</span>
              </div>
            </div>

            {/* Upscales Run */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4.5 flex flex-col justify-between space-y-4 group hover:border-slate-800 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Upscales Run</span>
                <div className="p-2 rounded bg-cyan-500/10 text-cyan-400">
                  <Zap className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-slate-200 block">{metrics.upscalesRun}</span>
                <span className="text-[10px] text-slate-500 block mt-1">High-res detail passes</span>
              </div>
            </div>

            {/* Average Variations */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4.5 flex flex-col justify-between space-y-4 group hover:border-slate-800 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Avg Variations</span>
                <div className="p-2 rounded bg-pink-500/10 text-pink-400">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-slate-200 block">
                  {metrics.averageVariationCount.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">Renders per project</span>
              </div>
            </div>

            {/* Workers Telemetry */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4.5 flex flex-col justify-between space-y-4 group hover:border-slate-800 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Workers</span>
                <div className="p-2 rounded bg-blue-500/10 text-blue-400">
                  <Cpu className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-slate-200 block">
                  {activeWorkerCount} <span className="text-xs text-slate-500 font-medium">/ {metrics.workers.length}</span>
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">
                  {busyWorkerCount} worker nodes busy
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Workers List and load status */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
                <Cpu className="h-5 w-5 text-indigo-400" />
                <span>Worker Workstations load</span>
              </h2>

              {metrics.workers.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/10 border border-slate-900 rounded-xl">
                  <Cpu className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No worker nodes registered in the cloud database.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {metrics.workers.map((worker) => {
                    const isStale = worker.lastHeartbeat && (Date.now() - new Date(worker.lastHeartbeat).getTime() > 35000); // 35s timeout
                    const calculatedStatus = isStale ? 'offline' : worker.status;
                    return (
                      <div
                        key={worker.id}
                        className="bg-slate-900/30 border border-slate-900 rounded-xl p-4.5 hover:border-slate-800 transition-colors flex flex-col justify-between space-y-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2.5">
                            <div className="p-2 rounded bg-slate-950 border border-slate-900 text-indigo-400">
                              <Monitor className="h-4.5 w-4.5" />
                            </div>
                            <div>
                              <h3 className="text-xs font-bold text-slate-200 truncate max-w-[130px]">{worker.name}</h3>
                              <span className="text-[9px] text-slate-500 font-mono">ID: {worker.id.slice(0, 12)}</span>
                            </div>
                          </div>
                          {getStatusIndicator(calculatedStatus)}
                        </div>

                        {/* GPU details */}
                        <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-400 bg-slate-950/40 p-2 rounded border border-slate-900/40">
                          <div>
                            <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">GPU</span>
                            <span className="font-semibold text-slate-350 truncate block mt-0.5" title={worker.gpuName || 'CPU only'}>
                              {worker.gpuName || 'Unknown GPU'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">VRAM</span>
                            <span className="font-semibold text-slate-350 block mt-0.5">
                              {worker.vramGb ? `${worker.vramGb} GB` : 'N/A'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-900/50 pt-2.5">
                          <div className="flex items-center space-x-1">
                            <Activity className="h-3 w-3 text-slate-550" />
                            <span>Heartbeat: <span className="font-semibold text-slate-350">{formatRelativeTime(worker.lastHeartbeat || worker.lastSeenAt)}</span></span>
                          </div>
                          <div>
                            <span>Mode: <span className="font-bold text-slate-350 uppercase">{worker.mode || 'idle'}</span></span>
                          </div>
                        </div>

                        {calculatedStatus === 'busy' && worker.currentJobId && (
                          <div className="bg-indigo-950/20 border border-indigo-900/30 rounded p-2 flex items-center justify-between text-[11px] text-indigo-400">
                            <span>Executing job:</span>
                            <Link href="/jobs" className="font-bold hover:underline bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-900/40">
                              {worker.currentJobId.replace('job_', '#')}
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Active Queue Status */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
                <Gauge className="h-5 w-5 text-indigo-400 animate-pulse" />
                <span>Active job progress</span>
              </h2>

              {metrics.activeJobs.length === 0 ? (
                <div className="text-center py-16 bg-slate-900/10 border border-slate-900 rounded-xl">
                  <Play className="h-6 w-6 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No jobs currently executing.</p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                    Jobs queued by users will appear here while active on worker nodes.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {metrics.activeJobs.map((job) => (
                    <div
                      key={job.id}
                      className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 hover:border-slate-800 transition-colors space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-250 text-xs">
                              Job {job.id.replace('job_', '#')}
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
                          </div>
                          <span className="text-[9px] text-slate-500 truncate block max-w-[160px] mt-0.5" title={job.project?.name || ''}>
                            Project: {job.project?.name || 'General'}
                          </span>
                        </div>

                        <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-950 text-indigo-400 border border-slate-900">
                          {job.status}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Progress</span>
                          <span className="font-bold">{job.progress}%</span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-900">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[9px] text-slate-500 border-t border-slate-900/40 pt-2">
                        <span>Node: <span className="font-bold text-slate-350">{job.worker?.name || 'Assigned'}</span></span>
                        <span>Elapsed: <span className="font-bold text-slate-350">{formatRelativeTime(job.createdAt)}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
