'use client';

import React, { useState, useEffect } from 'react';
import { 
  ListTodo, 
  RefreshCw, 
  Trash2, 
  Play, 
  CheckCircle2, 
  XCircle, 
  Hourglass, 
  Cpu, 
  SlidersHorizontal,
  Clock,
  Loader2,
  X,
  AlertTriangle
} from 'lucide-react';

interface RenderJob {
  id: string;
  projectId: string;
  workerId: string | null;
  status: 'queued' | 'claimed' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'needs_review';
  progress: number;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  failedAt: string | null;
  settingsJson: string | null;
  createdAt: string;
  completedAt: string | null;
  project?: {
    name: string;
  };
}

export default function JobsQueue() {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [filter, setFilter] = useState<'all' | 'queued' | 'processing' | 'completed' | 'failed'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isWorkerOnline, setIsWorkerOnline] = useState(false);

  // Detail Drawer States
  const [selectedJob, setSelectedJob] = useState<RenderJob | null>(null);
  const [jobEvents, setJobEvents] = useState<any[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchJobsList = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error('[Fetch Jobs Error]:', err);
    } finally {
      setIsLoading(false);
      if (showRefreshing) setIsRefreshing(false);
    }
  };

  const checkWorkerAvailability = async () => {
    try {
      const res = await fetch('/api/workers');
      if (res.ok) {
        const workers = await res.json();
        const active = workers.some((w: any) => w.status === 'online' || w.status === 'busy');
        setIsWorkerOnline(active);
      }
    } catch (err) {
      console.error('Failed to check worker status:', err);
    }
  };

  const fetchJobDetails = async (jobId: string) => {
    setIsLoadingEvents(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJob(data);
        setJobEvents(data.jobEvents || []);
      }
    } catch (err) {
      console.error('[Fetch Job Details Error]:', err);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleOpenDrawer = (job: RenderJob) => {
    setSelectedJob(job);
    setJobEvents([]);
    setIsDrawerOpen(true);
    fetchJobDetails(job.id);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedJob(null);
    setJobEvents([]);
  };

  useEffect(() => {
    fetchJobsList();
    checkWorkerAvailability();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      checkWorkerAvailability();
      fetchJobsList();
      if (isDrawerOpen && selectedJob) {
        fetchJobDetails(selectedJob.id);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [jobs, isDrawerOpen, selectedJob]);

  const handleRefresh = () => {
    fetchJobsList(true);
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this render job?')) return;
    
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: 'POST'
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to cancel render job');
      }

      await fetchJobsList();
      if (selectedJob?.id === jobId) {
        fetchJobDetails(jobId);
      }
    } catch (err: any) {
      console.error('[Cancel Job Error]:', err.message);
      alert(err.message || 'Failed to cancel render job.');
    }
  };

  const handleClearHistory = () => {
    setJobs(prevJobs => prevJobs.filter(j => j.status === 'processing' || j.status === 'queued' || j.status === 'claimed'));
  };

  const filteredJobs = jobs.filter(job => {
    if (filter === 'all') return true;
    if (filter === 'queued') return job.status === 'queued';
    if (filter === 'processing') return job.status === 'processing' || job.status === 'claimed';
    return job.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processing': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 animate-pulse uppercase tracking-wider">Processing</span>;
      case 'claimed': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">Claimed</span>;
      case 'queued': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 uppercase tracking-wider">Queued</span>;
      case 'completed': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 uppercase tracking-wider">Completed</span>;
      case 'needs_review': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25 uppercase tracking-wider">Needs Review</span>;
      default: 
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/25 uppercase tracking-wider">Failed</span>;
    }
  };

  const formatDuration = (createdStr: string, completedStr: string | null) => {
    const start = new Date(createdStr).getTime();
    const end = completedStr ? new Date(completedStr).getTime() : Date.now();
    const diffMs = end - start;
    if (diffMs < 0) return '0s';
    const diffSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(diffSecs / 60);
    const secs = diffSecs % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s${completedStr ? '' : ' elapsed'}`;
    }
    return `${secs}s${completedStr ? '' : ' elapsed'}`;
  };

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-400 bg-clip-text text-transparent">
            Rendering Queue
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Monitor and manage active rendering pipelines running on private node workers.
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={handleClearHistory}
            className="inline-flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-850 text-rose-450 hover:text-rose-350 text-xs font-semibold px-4 py-2.5 border border-slate-800 rounded-lg transition-all active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
            <span>Clear Completed</span>
          </button>
          
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-semibold px-4 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Filters and Counters stats */}
      <div className="flex flex-col lg:flex-row gap-5 items-stretch lg:items-center justify-between">
        {/* Navigation Filters */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/40 border border-slate-900 rounded-xl w-fit">
          {(['all', 'queued', 'processing', 'completed', 'failed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`
                px-4.5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all
                ${filter === tab 
                  ? 'bg-slate-950 text-indigo-400 border border-slate-900 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'}
              `}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-slate-900/30 border border-slate-900 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/40 border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Job ID / Project</th>
                <th className="px-6 py-4">Target Worker</th>
                <th className="px-6 py-4">Progress Details</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Timings</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-500 text-sm">
                    <Loader2 className="h-7 w-7 text-indigo-500 animate-spin mx-auto mb-2" />
                    Loading jobs queue from database...
                  </td>
                </tr>
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-500 text-sm">
                    <ListTodo className="h-9 w-9 text-slate-650 mx-auto mb-3" />
                    No render jobs found matching the active filters.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr 
                    key={job.id} 
                    onClick={() => handleOpenDrawer(job)}
                    className="hover:bg-slate-900/10 transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-200 text-sm truncate max-w-[200px] group-hover:text-indigo-400 transition-colors">
                        {job.project?.name || 'Unknown Project'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium uppercase mt-0.5 tracking-wider">
                        ID: {job.id} {job.retryCount > 0 && <span className="text-amber-400 font-bold ml-1.5">(Retry {job.retryCount}/{job.maxRetries})</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-400">
                      <div className="flex items-center space-x-1.5">
                        <Cpu className="h-3.5 w-3.5 text-indigo-500/60" />
                        <span className="font-mono text-[11px]">{job.workerId || 'Pending Claim...'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {job.status === 'processing' ? (
                        <div className="space-y-1.5 w-40">
                          <div className="flex justify-between text-[10px] text-indigo-400 font-bold">
                            <span>Rendering</span>
                            <span>{job.progress}%</span>
                          </div>
                          <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${job.progress}%` }} />
                          </div>
                        </div>
                      ) : (job.status === 'failed' || job.status === 'cancelled' || job.status === 'needs_review') ? (
                        <div className="text-rose-450 text-xs font-medium max-w-[200px] truncate" title={job.errorMessage || 'Failed'}>
                          {job.errorMessage || 'Job execution failed'}
                        </div>
                      ) : job.status === 'completed' ? (
                        <span className="text-slate-400 text-xs font-medium">100% completed</span>
                      ) : (
                        <span className="text-slate-500 text-xs italic">
                          {isWorkerOnline ? 'Waiting for worker claim...' : 'Will start when the render machine comes online'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(job.status)}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      <div>{formatDuration(job.createdAt, job.completedAt)}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Queued: {new Date(job.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(job.status === 'queued' || job.status === 'claimed' || job.status === 'processing') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelJob(job.id);
                          }}
                          className="text-xs font-semibold text-rose-400 hover:text-rose-350 hover:bg-rose-500/5 px-2.5 py-1.5 rounded-md border border-transparent hover:border-rose-500/10 transition-all"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer component */}
      {isDrawerOpen && selectedJob && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity" onClick={handleCloseDrawer} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-200">Job Execution Details</h2>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-medium uppercase tracking-wider">ID: {selectedJob.id}</p>
                </div>
                <button 
                  onClick={handleCloseDrawer}
                  className="p-1.5 rounded-lg text-slate-450 hover:text-slate-200 hover:bg-slate-855 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Status section */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4.5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">Current Status</span>
                    {selectedJob.status === 'queued' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 uppercase tracking-wider">Queued</span>
                    )}
                    {selectedJob.status === 'claimed' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 uppercase tracking-wider">Claimed</span>
                    )}
                    {selectedJob.status === 'processing' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/25 animate-pulse uppercase tracking-wider">Processing ({selectedJob.progress}%)</span>
                    )}
                    {selectedJob.status === 'completed' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 uppercase tracking-wider">Completed</span>
                    )}
                    {selectedJob.status === 'needs_review' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25 uppercase tracking-wider">Needs Review</span>
                    )}
                    {(selectedJob.status === 'failed' || selectedJob.status === 'cancelled') && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/25 uppercase tracking-wider">Failed</span>
                    )}
                  </div>

                  {selectedJob.status === 'queued' && !isWorkerOnline && (
                    <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 text-[11px] text-amber-450 leading-relaxed flex items-start space-x-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-555 mt-0.5" />
                      <span>No rendering worker is currently online. Your job will start automatically when a render machine comes online.</span>
                    </div>
                  )}

                  {/* Progress bar */}
                  {(selectedJob.status === 'processing' || selectedJob.status === 'claimed' || selectedJob.status === 'queued') && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Render Progress</span>
                        <span>{selectedJob.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-indigo-500 to-blue-500 h-full transition-all duration-300" 
                          style={{ width: `${selectedJob.progress}%` }} 
                        />
                      </div>
                    </div>
                  )}

                  {/* Meta attributes */}
                  <div className="text-[11px] space-y-2 border-t border-slate-900 pt-3 text-slate-400">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Target Worker</span>
                      <span className="font-mono text-slate-300">{selectedJob.workerId || 'Pending Claim...'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Queued At</span>
                      <span>{new Date(selectedJob.createdAt).toLocaleString()}</span>
                    </div>
                    {selectedJob.retryCount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Retry Attempts</span>
                        <span className="text-amber-400 font-semibold">{selectedJob.retryCount} / {selectedJob.maxRetries}</span>
                      </div>
                    )}
                    {selectedJob.completedAt && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Finished At</span>
                        <span>{new Date(selectedJob.completedAt).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedJob.failedAt && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Failed At</span>
                        <span>{new Date(selectedJob.failedAt).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedJob.errorMessage && (
                      <div className="mt-2.5 p-3 rounded bg-rose-500/5 border border-rose-500/10 text-[10px] text-rose-450 leading-normal">
                        <span className="font-bold block mb-0.5">Error Detail:</span>
                        {selectedJob.errorMessage}
                      </div>
                    )}
                  </div>
                </div>

                {/* Event History Timeline */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-455 uppercase tracking-wider">Event History Log</h3>
                    {isLoadingEvents && <Loader2 className="h-3.5 w-3.5 text-indigo-500 animate-spin" />}
                  </div>

                  <div className="relative border-l border-slate-800 pl-4.5 ml-2.5 space-y-5 py-1">
                    {jobEvents.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic pl-1">No transition logs registered yet.</p>
                    ) : (
                      jobEvents.map((evt, idx) => (
                        <div key={evt.id || idx} className="relative group">
                          {/* Bullet marker */}
                          <div className="absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full bg-slate-800 border-2 border-slate-900 group-hover:border-indigo-500 transition-colors" />
                          
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-300 capitalize">{evt.eventType}</span>
                              <span className="text-[9px] text-slate-550">{new Date(evt.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-[10px] text-slate-450 leading-relaxed">{evt.message}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Drawer Actions */}
              {(selectedJob.status === 'queued' || selectedJob.status === 'claimed' || selectedJob.status === 'processing') && (
                <div className="p-6 border-t border-slate-850 bg-slate-950/20">
                  <button
                    onClick={() => handleCancelJob(selectedJob.id)}
                    className="w-full inline-flex items-center justify-center space-x-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-455 hover:text-rose-400 text-xs font-bold py-2.5 rounded-lg border border-rose-500/10 transition-colors"
                  >
                    Cancel Render Job
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
