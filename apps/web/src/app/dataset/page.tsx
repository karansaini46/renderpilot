'use client';

import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Trash2,
  Edit3,
  Check,
  Star,
  Activity,
  ArrowRightLeft,
  Loader2,
  FileText
} from 'lucide-react';
import Link from 'next/link';

interface TrainingSample {
  id: string;
  renderId: string;
  styleId: string;
  imageUrl: string;
  caption: string | null;
  qualityScore: number | null;
  sceneType: string | null;
  datasetSplit: 'train' | 'validation' | 'test' | string;
  approvedForTraining: boolean;
  createdAt: string;
  style: {
    name: string;
  };
  render: {
    prompt: string;
    negativePrompt: string | null;
    project: {
      name: string;
    };
  };
}

export default function DatasetPage() {
  const [samples, setSamples] = useState<TrainingSample[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter and Search states
  const [styleFilter, setStyleFilter] = useState('All');
  const [splitFilter, setSplitFilter] = useState('All');
  const [readinessFilter, setReadinessFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state for caption placeholders
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState('');
  const [isSavingCaption, setIsSavingCaption] = useState(false);

  const fetchSamples = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const res = await fetch('/api/training-samples');
      if (res.ok) {
        const data = await res.json();
        setSamples(data);
      }
    } catch (err) {
      console.error('Failed to fetch training samples:', err);
    } finally {
      setIsLoading(false);
      if (showRefreshing) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSamples();
  }, []);

  const handleAction = async (id: string, action: string, payload: any) => {
    try {
      const res = await fetch('/api/training-samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ...payload })
      });

      if (res.ok) {
        const updated = await res.json();
        if (action === 'delete') {
          setSamples(samples.filter(s => s.id !== id));
        } else {
          setSamples(samples.map(s => s.id === id ? { ...s, ...updated } : s));
        }
      } else {
        console.error('Failed API action on training sample candidate');
      }
    } catch (err) {
      console.error('Error invoking action:', err);
    }
  };

  const startEditing = (id: string, currentCaption: string | null) => {
    setEditingId(id);
    setEditingCaption(currentCaption || '');
  };

  const saveCaption = async (id: string) => {
    setIsSavingCaption(true);
    try {
      await handleAction(id, 'caption', { caption: editingCaption });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingCaption(false);
    }
  };

  // Compute stat counters
  const totalCount = samples.length;
  const approvedCount = samples.filter(s => s.approvedForTraining).length;
  const pendingCount = totalCount - approvedCount;
  const trainCount = samples.filter(s => s.datasetSplit === 'train').length;
  const valCount = samples.filter(s => s.datasetSplit === 'validation').length;
  const testCount = samples.filter(s => s.datasetSplit === 'test').length;

  // Filtered dataset candidates
  const filteredSamples = samples.filter(s => {
    const styleName = s.style?.name || 'Custom';
    const matchesStyle = styleFilter === 'All' || styleName === styleFilter;
    const matchesSplit = splitFilter === 'All' || s.datasetSplit === splitFilter;
    const matchesReadiness = readinessFilter === 'All' || 
      (readinessFilter === 'Approved' ? s.approvedForTraining : !s.approvedForTraining);
    
    const matchesSearch = searchQuery === '' || 
      (s.caption && s.caption.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.render?.project?.name && s.render.project.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.sceneType && s.sceneType.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesStyle && matchesSplit && matchesReadiness && matchesSearch;
  });

  // Unique Styles list
  const uniqueStyles = Array.from(new Set(samples.map(s => s.style?.name).filter(Boolean)));

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return (
      <div className="flex items-center space-x-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${
              star <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-100 p-8 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-slate-900 pb-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-indigo-600/10 rounded-lg border border-indigo-500/20">
              <Database className="h-6 w-6 text-indigo-400" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-wider bg-gradient-to-r from-white via-slate-100 to-indigo-400 bg-clip-text text-transparent">
              Dataset Curation Console
            </h1>
          </div>
          <p className="text-slate-400 text-sm max-w-2xl">
            Audit and filter high-fidelity approved render variations as fine-tuning dataset candidates.
            Refine split layouts, revise captions, and mark candidates as ready for model training.
          </p>
        </div>

        <button
          onClick={() => fetchSamples(true)}
          disabled={isRefreshing}
          className="flex items-center justify-center space-x-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 hover:bg-slate-900/80 transition-all font-medium text-sm self-start md:self-center disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          <span>Refresh Candidates</span>
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-slate-900/30 backdrop-blur border border-slate-900/60 p-4 rounded-xl">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Total Samples</p>
          <p className="text-2xl font-bold text-white">{totalCount}</p>
        </div>
        <div className="bg-slate-900/30 backdrop-blur border border-slate-900/60 p-4 rounded-xl">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Approved</p>
          <p className="text-2xl font-bold text-emerald-400">{approvedCount}</p>
        </div>
        <div className="bg-slate-900/30 backdrop-blur border border-slate-900/60 p-4 rounded-xl">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Needs Audit</p>
          <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
        </div>
        <div className="bg-slate-900/30 backdrop-blur border border-slate-900/60 p-4 rounded-xl">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Train Split</p>
          <p className="text-2xl font-bold text-indigo-400">{trainCount}</p>
        </div>
        <div className="bg-slate-900/30 backdrop-blur border border-slate-900/60 p-4 rounded-xl">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Validation Split</p>
          <p className="text-2xl font-bold text-sky-400">{valCount}</p>
        </div>
        <div className="bg-slate-900/30 backdrop-blur border border-slate-900/60 p-4 rounded-xl">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Test Split</p>
          <p className="text-2xl font-bold text-purple-400">{testCount}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/40 backdrop-blur border border-slate-900/60 p-5 rounded-xl mb-8 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-initial min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search captions or projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Style Selector */}
          <div className="flex items-center space-x-2">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={styleFilter}
              onChange={(e) => setStyleFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-300 px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
            >
              <option value="All">All Styles</option>
              {uniqueStyles.map((style) => (
                <option key={style} value={style}>{style}</option>
              ))}
            </select>
          </div>

          {/* Split Selector */}
          <div className="flex items-center space-x-2">
            <ArrowRightLeft className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={splitFilter}
              onChange={(e) => setSplitFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-300 px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
            >
              <option value="All">All Splits</option>
              <option value="train">Train Split</option>
              <option value="validation">Validation Split</option>
              <option value="test">Test Split</option>
            </select>
          </div>

          {/* Readiness Selector */}
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={readinessFilter}
              onChange={(e) => setReadinessFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-300 px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
            >
              <option value="All">All Readiness</option>
              <option value="Approved">Ready for Training</option>
              <option value="Pending">Needs Curation</option>
            </select>
          </div>
        </div>

        <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider shrink-0 lg:ml-auto">
          Showing {filteredSamples.length} of {totalCount} Candidates
        </div>
      </div>

      {/* Samples Grid Display */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mb-4" />
          <p className="text-slate-400 text-sm">Loading dataset candidates...</p>
        </div>
      ) : filteredSamples.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
          <FileText className="h-12 w-12 text-slate-600 mb-4" />
          <h3 className="text-base font-bold text-slate-400 mb-1">No Dataset Candidates Found</h3>
          <p className="text-slate-500 text-xs max-w-md text-center">
            {totalCount === 0 
              ? 'Approved renders with quality ratings >= 4 will appear here automatically. Generate and approve some variations first!'
              : 'No candidates matched your search filters. Try clearing your search parameters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSamples.map((sample) => {
            const styleName = sample.style?.name || 'Custom Style';
            const projectName = sample.render?.project?.name || 'Unknown Project';
            
            return (
              <div 
                key={sample.id}
                className={`relative flex flex-col bg-slate-900/30 backdrop-blur rounded-xl border transition-all duration-300 overflow-hidden group ${
                  sample.approvedForTraining 
                    ? 'border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' 
                    : 'border-slate-900/80 hover:border-slate-800'
                }`}
              >
                {/* Image Showcase */}
                <div className="relative aspect-video w-full overflow-hidden bg-slate-950 border-b border-slate-900/80">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sample.imageUrl}
                    alt={sample.caption || 'Dataset rendering candidate'}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  
                  {/* Floating badges */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900/90 text-slate-200 border border-slate-800 uppercase tracking-wider">
                      {sample.sceneType || 'general'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                      sample.datasetSplit === 'train' 
                        ? 'bg-indigo-950/90 text-indigo-400 border-indigo-500/30' 
                        : sample.datasetSplit === 'validation'
                        ? 'bg-sky-950/90 text-sky-400 border-sky-500/30'
                        : 'bg-purple-950/90 text-purple-400 border-purple-500/30'
                    }`}>
                      {sample.datasetSplit}
                    </span>
                  </div>

                  <div className="absolute bottom-3 right-3 z-10 px-2 py-0.5 bg-slate-950/90 rounded border border-slate-800">
                    {renderStars(sample.qualityScore)}
                  </div>
                </div>

                {/* Body details */}
                <div className="p-5 flex-1 flex flex-col">
                  {/* Style and Project title */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-100 tracking-wider truncate max-w-[200px]" title={styleName}>
                        {styleName}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                        Project: {projectName}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${sample.approvedForTraining ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        sample.approvedForTraining ? 'text-emerald-400' : 'text-amber-500'
                      }`}>
                        {sample.approvedForTraining ? 'Approved' : 'Needs Audit'}
                      </span>
                    </div>
                  </div>

                  {/* Caption Editor Box */}
                  <div className="bg-slate-950/60 border border-slate-900 rounded-lg p-3.5 mb-5 flex-1 flex flex-col justify-between">
                    {editingId === sample.id ? (
                      <div className="flex flex-col gap-2 h-full justify-between">
                        <textarea
                          value={editingCaption}
                          onChange={(e) => setEditingCaption(e.target.value)}
                          className="w-full flex-1 bg-slate-900 border border-slate-800 rounded-md p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none min-h-[60px]"
                          placeholder="Refine Caption Prompt..."
                        />
                        <div className="flex items-center justify-end space-x-2 mt-2">
                          <button
                            onClick={() => setEditingId(null)}
                            disabled={isSavingCaption}
                            className="px-2.5 py-1 text-[10px] font-semibold uppercase text-slate-400 hover:text-slate-200 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveCaption(sample.id)}
                            disabled={isSavingCaption}
                            className="flex items-center space-x-1 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold uppercase text-white transition-colors"
                          >
                            {isSavingCaption ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col h-full justify-between min-h-[80px]">
                        <div>
                          <p className="text-[10px] text-indigo-400/80 font-bold uppercase tracking-wider mb-1">Curation Caption</p>
                          <p className="text-xs text-slate-300 leading-relaxed italic">
                            &ldquo;{sample.caption || 'No caption template registered.'}&rdquo;
                          </p>
                        </div>
                        <button
                          onClick={() => startEditing(sample.id, sample.caption)}
                          className="flex items-center space-x-1.5 text-slate-500 hover:text-indigo-400 text-[10px] font-bold uppercase tracking-wider mt-3 self-end transition-colors"
                        >
                          <Edit3 className="h-3 w-3" />
                          <span>Edit Caption</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions Grid */}
                  <div className="grid grid-cols-3 gap-2.5 pt-4 border-t border-slate-900/60 mt-auto">
                    {/* Split Dropdown Button */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Set Split</span>
                      <select
                        value={sample.datasetSplit}
                        onChange={(e) => handleAction(sample.id, 'split', { datasetSplit: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded-md text-[10px] font-bold text-slate-300 p-1.5 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="train">Train</option>
                        <option value="validation">Val</option>
                        <option value="test">Test</option>
                      </select>
                    </div>

                    {/* Approve Toggle */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Readiness</span>
                      <button
                        onClick={() => handleAction(sample.id, 'approve', { approvedForTraining: !sample.approvedForTraining })}
                        className={`w-full py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                          sample.approvedForTraining 
                            ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.05)]' 
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300'
                        }`}
                      >
                        {sample.approvedForTraining ? 'Ready' : 'Approve'}
                      </button>
                    </div>

                    {/* Delete button */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Exclude</span>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to exclude this variation from the dataset?')) {
                            handleAction(sample.id, 'delete', {});
                          }
                        }}
                        className="w-full flex items-center justify-center space-x-1 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-slate-800 bg-slate-950 text-slate-500 hover:text-rose-400 hover:border-rose-500/20 transition-all"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
