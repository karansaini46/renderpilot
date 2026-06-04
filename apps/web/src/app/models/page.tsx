'use client';

import React, { useState, useEffect } from 'react';
import {
  Layers,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Trash2,
  Plus,
  Check,
  Star,
  Loader2,
  FileText,
  AlertTriangle,
  Server,
  Activity,
  Copy,
  PlusCircle,
  BookOpen,
  GitCompare,
  FileCheck,
  AlertCircle
} from 'lucide-react';

interface LoraVersion {
  id: string;
  styleId: string;
  versionName: string;
  version: string;
  fileUrl: string;
  datasetSize: number | null;
  benchmarkScore: number | null;
  geometryScore: number | null;
  styleScore: number | null;
  realismScore: number | null;
  materialScore: number | null;
  overallScore: number | null;
  passed: boolean;
  status: string;
  active: boolean;
  notes: string | null;
  createdAt: string;
  style: {
    name: string;
  };
}

interface Style {
  id: string;
  name: string;
}

export default function ModelRegistryPage() {
  const [versions, setVersions] = useState<LoraVersion[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'registry' | 'compare'>('registry');
  const [selectedStyleCompare, setSelectedStyleCompare] = useState<string>('');

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [activeFilter, setActiveFilter] = useState('All');

  // Modal and creation form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formStyleId, setFormStyleId] = useState('');
  const [formVersionName, setFormVersionName] = useState('');
  const [formVersion, setFormVersion] = useState('1.0.0');
  const [formFileUrl, setFormFileUrl] = useState('');
  const [formDatasetSize, setFormDatasetSize] = useState<string>('');
  const [formBenchmarkScore, setFormBenchmarkScore] = useState<string>('');
  
  // New benchmark scores states
  const [formGeometryScore, setFormGeometryScore] = useState<string>('');
  const [formStyleScore, setFormStyleScore] = useState<string>('');
  const [formRealismScore, setFormRealismScore] = useState<string>('');
  const [formMaterialScore, setFormMaterialScore] = useState<string>('');
  const [formOverallScore, setFormOverallScore] = useState<string>('');
  const [formPassed, setFormPassed] = useState<boolean>(false);

  const [formStatus, setFormStatus] = useState('ready');
  const [formNotes, setFormNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copySuccessId, setCopySuccessId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const res = await fetch('/api/lora-versions');
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions);
        setStyles(data.styles);
        
        // Auto-select first style in form and compare view if available
        if (data.styles.length > 0) {
          if (!formStyleId) {
            setFormStyleId(data.styles[0].id);
          }
          setSelectedStyleCompare(prev => prev || data.styles[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch version registry:', err);
    } finally {
      setIsLoading(false);
      if (showRefreshing) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAction = async (id: string, action: 'activate' | 'deactivate' | 'delete') => {
    try {
      const res = await fetch('/api/lora-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action })
      });

      if (res.ok) {
        if (action === 'delete') {
          setVersions(versions.filter(v => v.id !== id));
          triggerToast('Version excluded successfully.');
        } else {
          // Refresh list to pull updated active statuses globally
          const updated = await res.json();
          // Since activation deactivates other versions under the style, we fetch again for full consistency
          fetchData();
          triggerToast(`Version successfully ${action}d.`);
        }
      } else {
        const err = await res.json();
        alert(`Action failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error executing action:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      action: 'create',
      styleId: formStyleId,
      versionName: formVersionName,
      version: formVersion,
      fileUrl: formFileUrl,
      datasetSize: formDatasetSize ? Number(formDatasetSize) : null,
      benchmarkScore: formOverallScore ? Number(formOverallScore) : null,
      geometryScore: formGeometryScore ? Number(formGeometryScore) : null,
      styleScore: formStyleScore ? Number(formStyleScore) : null,
      realismScore: formRealismScore ? Number(formRealismScore) : null,
      materialScore: formMaterialScore ? Number(formMaterialScore) : null,
      overallScore: formOverallScore ? Number(formOverallScore) : null,
      passed: formPassed,
      status: formStatus,
      notes: formNotes
    };

    try {
      const res = await fetch('/api/lora-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const newVersion = await res.json();
        setVersions([newVersion, ...versions]);
        setIsModalOpen(false);
        triggerToast('New model version successfully registered.');
        
        // Reset form inputs (keeping styleId select intact)
        setFormVersionName('');
        setFormVersion('1.0.0');
        setFormFileUrl('');
        setFormDatasetSize('');
        setFormBenchmarkScore('');
        setFormGeometryScore('');
        setFormStyleScore('');
        setFormRealismScore('');
        setFormMaterialScore('');
        setFormOverallScore('');
        setFormPassed(false);
        setFormStatus('ready');
        setFormNotes('');
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to create version record');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Network error registering version record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerToast = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccessId(id);
    setTimeout(() => setCopySuccessId(null), 1500);
  };

  // Grouped stats calculations
  const totalCount = versions.length;
  const activeCount = versions.filter(v => v.active).length;
  
  // Unique styles with at least one version record
  const uniqueStylesWithVersions = Array.from(new Set(versions.map(v => v.styleId))).length;

  // Filtered versions candidates
  const filteredVersions = versions.filter(v => {
    const matchesStyle = styleFilter === 'All' || v.styleId === styleFilter;
    const matchesStatus = statusFilter === 'All' || v.status === statusFilter;
    const matchesActive = activeFilter === 'All' || 
      (activeFilter === 'Active' ? v.active : !v.active);

    const matchesSearch = searchQuery === '' ||
      v.versionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.fileUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.notes && v.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesStyle && matchesStatus && matchesActive && matchesSearch;
  });

  // Group filtered versions by style name
  const groupedVersions: { [styleName: string]: LoraVersion[] } = {};
  filteredVersions.forEach(v => {
    const styleName = v.style?.name || 'Custom Style';
    if (!groupedVersions[styleName]) {
      groupedVersions[styleName] = [];
    }
    groupedVersions[styleName].push(v);
  });

  const sortedStyleNames = Object.keys(groupedVersions).sort();

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-100 p-8 min-h-screen relative">
      
      {/* Toast Alert Notification */}
      {successMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2 bg-emerald-500 text-slate-950 px-4 py-3 rounded-lg shadow-xl font-bold text-sm transition-all duration-300 animate-bounce">
          <CheckCircle className="h-4.5 w-4.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-slate-900 pb-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-indigo-600/10 rounded-lg border border-indigo-500/20">
              <Layers className="h-6 w-6 text-indigo-400" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-wider bg-gradient-to-r from-white via-slate-100 to-indigo-400 bg-clip-text text-transparent">
              Model Version Registry
            </h1>
          </div>
          <p className="text-slate-400 text-sm max-w-2xl">
            Register and audit style weights and checkpoints. Only one active version is allowed per style. Active versions are loaded by workers during render jobs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-350 hover:text-white hover:border-slate-700 hover:bg-slate-900/80 transition-all font-semibold text-xs disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Refresh Registry</span>
          </button>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/20 transition-all font-semibold text-xs active:scale-95"
          >
            <Plus className="h-4.5 w-4.5" />
            <span>Register Version</span>
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="bg-slate-900/30 backdrop-blur border border-slate-900/80 p-5 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Weights Registered</p>
            <p className="text-3xl font-bold text-white">{totalCount}</p>
          </div>
          <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/10">
            <Server className="h-6 w-6" />
          </div>
        </div>
        <div className="bg-slate-900/30 backdrop-blur border border-slate-900/80 p-5 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Active Model Versions</p>
            <p className="text-3xl font-bold text-emerald-400">{activeCount}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/10">
            <Activity className="h-6 w-6" />
          </div>
        </div>
        <div className="bg-slate-900/30 backdrop-blur border border-slate-900/80 p-5 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Represented Styles</p>
            <p className="text-3xl font-bold text-indigo-350">{uniqueStylesWithVersions} / {styles.length}</p>
          </div>
          <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-350 border border-indigo-500/10">
            <BookOpen className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-900 mb-8 space-x-8">
        <button
          onClick={() => setActiveTab('registry')}
          className={`pb-4 text-xs font-bold tracking-wider uppercase border-b-2 transition-all ${
            activeTab === 'registry'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-500 hover:text-slate-350'
          }`}
        >
          Version Registry
        </button>
        <button
          onClick={() => setActiveTab('compare')}
          className={`pb-4 text-xs font-bold tracking-wider uppercase border-b-2 transition-all ${
            activeTab === 'compare'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-500 hover:text-slate-350'
          }`}
        >
          Version Comparison
        </button>
      </div>

      {activeTab === 'registry' ? (
        <>
          {/* Filters Bar */}
          <div className="bg-slate-900/40 backdrop-blur border border-slate-900/60 p-5 rounded-xl mb-8 flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
              {/* Search bar */}
              <div className="relative flex-1 sm:flex-initial min-w-[240px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-555" />
                <input
                  type="text"
                  placeholder="Search names, keys, notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Style Filter */}
              <div className="flex items-center space-x-2">
                <Filter className="h-3.5 w-3.5 text-slate-555" />
                <select
                  value={styleFilter}
                  onChange={(e) => setStyleFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-350 px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
                >
                  <option value="All">All Styles</option>
                  {styles.map(style => (
                    <option key={style.id} value={style.id}>{style.name}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center space-x-2">
                <Activity className="h-3.5 w-3.5 text-slate-555" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-350 px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
                >
                  <option value="All">All Statuses</option>
                  <option value="ready">Ready</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Active Filter */}
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-3.5 w-3.5 text-slate-555" />
                <select
                  value={activeFilter}
                  onChange={(e) => setActiveFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-350 px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
                >
                  <option value="All">All Activation</option>
                  <option value="Active">Active Only</option>
                  <option value="Inactive">Inactive Only</option>
                </select>
              </div>
            </div>

            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider shrink-0 lg:ml-auto">
              Showing {filteredVersions.length} of {totalCount} Versions
            </div>
          </div>

          {/* Main Grid/Table Listing */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mb-4" />
              <p className="text-slate-400 text-sm">Loading registry database...</p>
            </div>
          ) : filteredVersions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
              <FileText className="h-12 w-12 text-slate-655 mb-4" />
              <h3 className="text-base font-bold text-slate-400 mb-1">No Model Versions Registered</h3>
              <p className="text-slate-500 text-xs max-w-md text-center">
                {totalCount === 0
                  ? 'No weight records exist. Register a style version using the form.'
                  : 'No weight records matched your filters. Try clearing your parameters.'}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {sortedStyleNames.map(styleName => {
                const styleVersions = groupedVersions[styleName];
                
                return (
                  <div 
                    key={styleName}
                    className="bg-slate-900/20 border border-slate-900/80 rounded-2xl p-6 lg:p-7 backdrop-blur-sm shadow-[0_4px_25px_rgba(0,0,0,0.25)]"
                  >
                    {/* Style Header */}
                    <div className="pb-4 border-b border-slate-900 mb-5">
                      <h2 className="text-lg font-extrabold tracking-wide text-slate-100 flex items-center gap-2">
                        Style Group: <span className="text-indigo-400">{styleName}</span>
                        <span className="text-xs font-bold text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-900">
                          {styleVersions.length} {styleVersions.length === 1 ? 'version' : 'versions'}
                        </span>
                      </h2>
                    </div>

                    {/* Versions Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                            <th className="pb-3 pr-4">Active</th>
                            <th className="pb-3 pr-4">Version Name</th>
                            <th className="pb-3 pr-4">Tag</th>
                            <th className="pb-3 pr-4">File Key / Path</th>
                            <th className="pb-3 pr-4 text-center">Dataset</th>
                            <th className="pb-3 pr-4 text-center">Benchmark</th>
                            <th className="pb-3 pr-4">Status</th>
                            <th className="pb-3 pr-4">Registered</th>
                            <th className="pb-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/40 text-xs">
                          {styleVersions.map(v => {
                            const isFailed = v.status === 'failed';
                            const isPending = v.status === 'pending';
                            
                            return (
                              <tr 
                                key={v.id}
                                className={`group border-b border-slate-900/20 hover:bg-slate-900/10 transition-colors ${
                                  v.active ? 'bg-indigo-950/5' : ''
                                }`}
                              >
                                {/* Active badge */}
                                <td className="py-4 pr-4">
                                  <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                                    v.active 
                                      ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.1)]' 
                                      : 'bg-slate-950 text-slate-500 border-slate-900'
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${v.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                                    <span>{v.active ? 'Active' : 'Inactive'}</span>
                                  </span>
                                </td>

                                {/* Version Name & Notes */}
                                <td className="py-4 pr-4 max-w-[200px]">
                                  <span className="font-bold text-slate-200 block truncate" title={v.versionName}>
                                    {v.versionName}
                                  </span>
                                  {v.notes && (
                                    <span className="text-[10px] text-slate-500 block truncate max-w-[180px]" title={v.notes}>
                                      {v.notes}
                                    </span>
                                  )}
                                </td>

                                {/* Tag */}
                                <td className="py-4 pr-4 font-mono font-bold text-indigo-400">
                                  {v.version}
                                </td>

                                {/* File Key / Path */}
                                <td className="py-4 pr-4 max-w-[220px]">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-mono text-[10px] text-slate-400 truncate max-w-[180px]" title={v.fileUrl}>
                                      {v.fileUrl}
                                    </span>
                                    <button
                                      onClick={() => handleCopy(v.id, v.fileUrl)}
                                      className="text-slate-555 hover:text-slate-300 transition-colors shrink-0"
                                      title="Copy path"
                                    >
                                      {copySuccessId === v.id ? (
                                        <Check className="h-3 w-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  </div>
                                </td>

                                {/* Dataset Size */}
                                <td className="py-4 pr-4 text-center font-bold text-slate-300">
                                  {v.datasetSize !== null ? `${v.datasetSize} img` : '—'}
                                </td>

                                {/* Benchmark Score */}
                                <td className="py-4 pr-4 text-center font-bold">
                                  {v.benchmarkScore !== null ? (
                                    <span className="text-amber-400 fill-amber-400 flex items-center justify-center space-x-1">
                                      <Star className="h-3.5 w-3.5 fill-amber-400 shrink-0 text-amber-500" />
                                      <span>{v.benchmarkScore.toFixed(2)}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">—</span>
                                  )}
                                </td>

                                {/* Status */}
                                <td className="py-4 pr-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                                    isFailed 
                                      ? 'bg-rose-950/20 text-rose-450 border-rose-500/20' 
                                      : isPending
                                      ? 'bg-amber-950/20 text-amber-500 border-amber-500/20'
                                      : 'bg-slate-950 text-slate-350 border-slate-900'
                                  }`}>
                                    {v.status}
                                  </span>
                                </td>

                                {/* Registered Date */}
                                <td className="py-4 pr-4 text-slate-500 text-[10px] font-medium">
                                  {new Date(v.createdAt).toLocaleDateString()}
                                </td>

                                {/* Actions buttons */}
                                <td className="py-4 text-right">
                                  <div className="flex items-center justify-end space-x-2.5">
                                    {v.active ? (
                                      <button
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to deactivate version "${v.versionName}"?`)) {
                                            handleAction(v.id, 'deactivate');
                                          }
                                        }}
                                        className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-350 hover:text-white hover:border-slate-700 transition-colors text-[10px] font-bold uppercase tracking-wider"
                                      >
                                        Deactivate
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to activate version "${v.versionName}" for style "${styleName}"?\nThis will deactivate all other versions for this style.`)) {
                                            handleAction(v.id, 'activate');
                                          }
                                        }}
                                        disabled={isFailed}
                                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                          isFailed 
                                            ? 'bg-slate-950 border border-slate-950 text-slate-600 cursor-not-allowed'
                                            : 'bg-indigo-650 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/10'
                                        }`}
                                      >
                                        Activate
                                      </button>
                                    )}
                                    
                                    <button
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to exclude version "${v.versionName}" from the registry?`)) {
                                          handleAction(v.id, 'delete');
                                        }
                                      }}
                                      className="p-1 rounded text-slate-555 hover:text-rose-400 hover:bg-rose-950/10 transition-all border border-transparent hover:border-rose-500/10"
                                      title="Delete record"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Version Comparison View */
        <div className="space-y-6">
          {/* Style Selector */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/20 p-5 rounded-xl border border-slate-900/80">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20 animate-pulse">
                <GitCompare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-200">Select Style to Compare</h3>
                <p className="text-xs text-slate-505">Compare metrics and validation outcomes of LoRA version candidates side-by-side.</p>
              </div>
            </div>
            <div className="w-full md:w-64">
              <select
                value={selectedStyleCompare}
                onChange={(e) => setSelectedStyleCompare(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-205 px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {styles.map(style => (
                  <option key={style.id} value={style.id}>{style.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Compare Dashboard */}
          {(() => {
            const styleVersions = versions.filter(v => v.styleId === selectedStyleCompare);
            const activeVersion = styleVersions.find(v => v.active);
            
            // Get all recommended versions (not active, passed = true, score > active score)
            const recommendedVersions = styleVersions.filter(v => {
              if (v.active) return false;
              if (!v.passed) return false;
              if (v.overallScore === null) return false;
              if (!activeVersion) return true;
              return activeVersion.overallScore === null || v.overallScore > activeVersion.overallScore;
            });

            // Sort recommended by overallScore descending to find the best candidate
            const sortedRecommended = [...recommendedVersions].sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));
            const bestRecommended = sortedRecommended[0];

            if (styleVersions.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
                  <FileText className="h-12 w-12 text-slate-600 mb-4" />
                  <h3 className="text-base font-bold text-slate-400 mb-1">No Versions Registered</h3>
                  <p className="text-slate-500 text-xs max-w-md text-center">
                    No LoRA weight versions are registered under this style. Use the "Register Version" modal to add one.
                  </p>
                </div>
              );
            }

            return (
              <>
                {/* Recommendation Banner */}
                {bestRecommended ? (
                  <div className="bg-gradient-to-r from-emerald-950/20 via-emerald-950/5 to-slate-900 border border-emerald-500/20 p-5 rounded-xl flex items-start gap-4 shadow-lg animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20 shrink-0">
                      <FileCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-emerald-400 text-sm mb-1 font-mono uppercase tracking-wider">Activation Recommended</h4>
                      <p className="text-xs text-slate-350 leading-relaxed mt-0.5">
                        We recommend activating <strong className="text-white">{bestRecommended.versionName} ({bestRecommended.version})</strong>. It has passed validation and achieves an overall score of <strong className="text-white">{bestRecommended.overallScore?.toFixed(2)}</strong>, which is higher than the currently active version.
                      </p>
                    </div>
                  </div>
                ) : activeVersion ? (
                  <div className="bg-gradient-to-r from-slate-900 to-slate-900 border border-slate-800 p-5 rounded-xl flex items-start gap-4 shadow-md">
                    <div className="p-2.5 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20 shrink-0">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-indigo-400 text-sm mb-1 font-mono uppercase tracking-wider">Current Active Version Optimal</h4>
                      <p className="text-xs text-slate-355 leading-relaxed mt-0.5">
                        The active version <strong className="text-white">{activeVersion.versionName} ({activeVersion.version})</strong> is the highest performing validated version. No updates are recommended at this time.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-amber-950/20 via-amber-950/5 to-slate-900 border border-amber-500/20 p-5 rounded-xl flex items-start gap-4 shadow-md">
                    <div className="p-2.5 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20 shrink-0">
                      <AlertCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-amber-400 text-sm mb-1 font-mono uppercase tracking-wider">No Active Model Version</h4>
                      <p className="text-xs text-slate-355 leading-relaxed mt-0.5">
                        This style has no active model weights. None of the registered versions are recommended (ensure they are marked "Passed validation" and are set to "Ready" status).
                      </p>
                    </div>
                  </div>
                )}

                {/* Comparison Dashboard Table */}
                <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 backdrop-blur-sm shadow-[0_4px_25px_rgba(0,0,0,0.25)]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                          <th className="pb-4 pr-4">Version & Tag</th>
                          <th className="pb-4 pr-4 text-center">Status</th>
                          <th className="pb-4 pr-4 text-center">Geometry</th>
                          <th className="pb-4 pr-4 text-center">Style Match</th>
                          <th className="pb-4 pr-4 text-center">Realism</th>
                          <th className="pb-4 pr-4 text-center">Material</th>
                          <th className="pb-4 pr-4 text-center">Overall Score</th>
                          <th className="pb-4 pr-4 text-center">Validation</th>
                          <th className="pb-4 pr-4">Recommendation</th>
                          <th className="pb-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/40 text-xs">
                        {styleVersions.map(v => {
                          const isBest = bestRecommended && v.id === bestRecommended.id;
                          const isFailed = v.status === 'failed';

                          // Get recommendation details
                          let recStatus = { recommended: false, reason: '', badge: '' };
                          if (v.active) {
                            recStatus = { recommended: false, reason: 'Currently active version', badge: 'Active' };
                          } else if (!v.passed) {
                            recStatus = { recommended: false, reason: 'Failed validation check', badge: 'Not recommended' };
                          } else if (v.overallScore === null) {
                            recStatus = { recommended: false, reason: 'Missing overall score', badge: 'Not recommended' };
                          } else if (activeVersion) {
                            if (activeVersion.overallScore === null) {
                              recStatus = { recommended: true, reason: 'Exceeds unrated active version', badge: 'Recommended' };
                            } else if (v.overallScore > activeVersion.overallScore) {
                              recStatus = { recommended: true, reason: `Exceeds active score (${v.overallScore.toFixed(2)} > ${activeVersion.overallScore.toFixed(2)})`, badge: 'Recommended' };
                            } else {
                              recStatus = { recommended: false, reason: `Score is not higher than active (${v.overallScore.toFixed(2)} <= ${activeVersion.overallScore.toFixed(2)})`, badge: 'Not recommended' };
                            }
                          } else {
                            recStatus = { recommended: true, reason: 'Passed validation (No active version)', badge: 'Recommended' };
                          }

                          return (
                            <tr 
                              key={v.id} 
                              className={`group border-b border-slate-900/20 hover:bg-slate-900/10 transition-colors ${
                                v.active 
                                  ? 'bg-indigo-950/10 border-l-2 border-indigo-500' 
                                  : isBest 
                                  ? 'bg-emerald-950/10 border-l-2 border-emerald-500' 
                                  : ''
                              }`}
                            >
                              {/* Version & Tag */}
                              <td className="py-4 pr-4 max-w-[180px]">
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-200 block truncate" title={v.versionName}>
                                    {v.versionName}
                                  </span>
                                  <span className="font-mono text-[10px] text-indigo-400 font-bold mt-0.5">
                                    {v.version}
                                  </span>
                                </div>
                              </td>

                              {/* Status */}
                              <td className="py-4 pr-4 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                                  isFailed 
                                    ? 'bg-rose-950/20 text-rose-450 border-rose-500/20' 
                                    : v.status === 'pending'
                                    ? 'bg-amber-950/20 text-amber-500 border-amber-500/20'
                                    : 'bg-slate-950 text-slate-350 border-slate-900'
                                }`}>
                                  {v.status}
                                </span>
                              </td>

                              {/* Geometry */}
                              <td className="py-4 pr-4 text-center font-semibold text-slate-300 font-mono">
                                {v.geometryScore !== null ? v.geometryScore.toFixed(2) : '—'}
                              </td>

                              {/* Style Match */}
                              <td className="py-4 pr-4 text-center font-semibold text-slate-300 font-mono">
                                {v.styleScore !== null ? v.styleScore.toFixed(2) : '—'}
                              </td>

                              {/* Realism */}
                              <td className="py-4 pr-4 text-center font-semibold text-slate-300 font-mono">
                                {v.realismScore !== null ? v.realismScore.toFixed(2) : '—'}
                              </td>

                              {/* Material */}
                              <td className="py-4 pr-4 text-center font-semibold text-slate-300 font-mono">
                                {v.materialScore !== null ? v.materialScore.toFixed(2) : '—'}
                              </td>

                              {/* Overall Score */}
                              <td className="py-4 pr-4 text-center font-mono">
                                {v.overallScore !== null ? (
                                  <span className="inline-flex items-center space-x-1 font-bold text-amber-400">
                                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-550 shrink-0" />
                                    <span>{v.overallScore.toFixed(2)}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-655">—</span>
                                )}
                              </td>

                              {/* Validation Status */}
                              <td className="py-4 pr-4 text-center">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                                  v.passed 
                                    ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]' 
                                    : 'bg-rose-950/20 text-rose-450 border-rose-500/20'
                                }`}>
                                  {v.passed ? (
                                    <>
                                      <Check className="h-3 w-3" />
                                      <span>Passed</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3 w-3" />
                                      <span>Failed</span>
                                    </>
                                  )}
                                </span>
                              </td>

                              {/* Recommendation */}
                              <td className="py-4 pr-4 max-w-[200px]">
                                <div className="flex flex-col">
                                  {recStatus.badge === 'Active' && (
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">
                                      Active Checkpoint
                                    </span>
                                  )}
                                  {recStatus.badge === 'Recommended' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                                      <FileCheck className="h-3.5 w-3.5 animate-pulse" />
                                      Recommended
                                    </span>
                                  )}
                                  {recStatus.badge === 'Not recommended' && (
                                    <span className="text-[10px] font-bold text-slate-550 uppercase tracking-wide">
                                      Not recommended
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                                    {recStatus.reason}
                                  </span>
                                </div>
                              </td>

                              {/* Action */}
                              <td className="py-4 text-right">
                                {v.active ? (
                                  <button
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to deactivate version "${v.versionName}"?`)) {
                                        handleAction(v.id, 'deactivate');
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-350 hover:text-white hover:border-slate-700 transition-colors text-[10px] font-bold uppercase tracking-wider"
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to activate version "${v.versionName}" for style "${styleVersions[0].style.name}"?\nThis will deactivate all other versions for this style.`)) {
                                        handleAction(v.id, 'activate');
                                      }
                                    }}
                                    disabled={isFailed}
                                    className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                                      isFailed 
                                        ? 'bg-slate-950 border border-slate-950 text-slate-600 cursor-not-allowed'
                                        : isBest
                                        ? 'bg-emerald-650 hover:bg-emerald-600 text-white shadow-lg hover:shadow-emerald-500/10'
                                        : 'bg-indigo-650 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/10'
                                    }`}
                                  >
                                    Activate
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Creation Form Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div 
            className="absolute inset-0" 
            onClick={() => setIsModalOpen(false)} 
          />
          <div className="relative bg-slate-950 border border-slate-900 rounded-2xl w-full max-w-lg shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-250">
            {/* Modal Header */}
            <div className="px-6 py-4.5 border-b border-slate-900 bg-slate-900/10 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <PlusCircle className="h-4.5 w-4.5 text-indigo-400" />
                <span>Register Model Version</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-350 text-xs font-semibold uppercase"
              >
                Close
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              
              {errorMessage && (
                <div className="p-3.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Style Dropdown */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Style *</label>
                <select
                  required
                  value={formStyleId}
                  onChange={(e) => setFormStyleId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-200 transition-colors"
                >
                  {styles.map(style => (
                    <option key={style.id} value={style.id}>{style.name}</option>
                  ))}
                </select>
              </div>

              {/* Version Name and Tag */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Version Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cozy Scandi Loft"
                    value={formVersionName}
                    onChange={(e) => setFormVersionName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tag *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1.0.0"
                    value={formVersion}
                    onChange={(e) => setFormVersion(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-650 transition-colors"
                  />
                </div>
              </div>

              {/* Safetensors URL / fileUrl */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Object Key / Safetensors Path *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. styles/scandi/loft_v1.safetensors"
                  value={formFileUrl}
                  onChange={(e) => setFormFileUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-650 font-mono transition-colors"
                />
              </div>

              {/* Dataset Size and Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dataset Size (images)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 15"
                    value={formDatasetSize}
                    onChange={(e) => setFormDatasetSize(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-650 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Training Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-200 transition-colors"
                  >
                    <option value="ready">Ready (Usable for rendering)</option>
                    <option value="pending">Pending (Training in progress)</option>
                    <option value="failed">Failed (Training crashed / unusable)</option>
                  </select>
                </div>
              </div>

              {/* Benchmark Scores Grid */}
              <div className="bg-slate-900/50 border border-slate-900 rounded-xl p-4 space-y-3.5">
                <h4 className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider font-mono">Benchmark Evaluation</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Geometry Score (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={0.01}
                      placeholder="e.g. 4.20"
                      value={formGeometryScore}
                      onChange={(e) => setFormGeometryScore(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-650 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Style Score (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={0.01}
                      placeholder="e.g. 4.50"
                      value={formStyleScore}
                      onChange={(e) => setFormStyleScore(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-650 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Realism Score (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={0.01}
                      placeholder="e.g. 4.10"
                      value={formRealismScore}
                      onChange={(e) => setFormRealismScore(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-650 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Material Score (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={0.01}
                      placeholder="e.g. 4.30"
                      value={formMaterialScore}
                      onChange={(e) => setFormMaterialScore(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-650 transition-colors font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1 border-t border-slate-950/60">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Overall Score (1-5) *</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={0.01}
                      required
                      placeholder="e.g. 4.28"
                      value={formOverallScore}
                      onChange={(e) => setFormOverallScore(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 transition-colors font-mono font-bold"
                    />
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center space-x-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formPassed}
                        onChange={(e) => setFormPassed(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-800 text-indigo-650 focus:ring-indigo-500 focus:ring-offset-slate-950 focus:ring-1 h-4 w-4"
                      />
                      <span className="text-xs font-bold text-slate-350 select-none">Passed Validation</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Training Notes / Presets</label>
                <textarea
                  placeholder="e.g. Trained for 15 epochs, learning rate: 1e-4, batch size: 1."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-650 resize-none min-h-[60px] transition-colors"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center space-x-1.5 px-5 py-2 rounded bg-indigo-650 hover:bg-indigo-600 text-xs font-bold text-white transition-colors uppercase active:scale-95 disabled:opacity-55"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>{isSubmitting ? 'Registering...' : 'Register'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
