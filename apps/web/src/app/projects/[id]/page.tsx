'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Upload, 
  Play, 
  FileText, 
  Trash2, 
  Check, 
  X, 
  Clock, 
  Sliders, 
  Loader2,
  AlertTriangle,
  FolderOpen,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  Star
} from 'lucide-react';

interface ProjectFile {
  id: string;
  fileUrl: string;
  fileType: string;
  metadataJson: string;
  createdAt: string;
  downloadUrl?: string;
}

interface Render {
  id: string;
  seed: string;
  style: string;
  status: string;
  rating: number;
  previewUrl: string;
  createdAt: string;
}

interface RenderJob {
  id: string;
  projectId: string;
  workerId: string | null;
  status: 'queued' | 'claimed' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  errorMessage: string | null;
  settingsJson: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface Project {
  id: string;
  name: string;
  projectType: string;
  sceneType: string;
  stylePreference: string;
  notes: string;
  status: string;
  projectFiles: ProjectFile[];
  renders: Render[];
  renderJobs: RenderJob[];
}

interface ProjectDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectDetails({ params }: ProjectDetailsPageProps) {
  const { id } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [filesList, setFilesList] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'renders' | 'files'>('files');

  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [isLaunchingJob, setIsLaunchingJob] = useState(false);
  const [selectedJob, setSelectedJob] = useState<RenderJob | null>(null);
  const [jobEvents, setJobEvents] = useState<any[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isWorkerOnline, setIsWorkerOnline] = useState(false);

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

  const fetchProjectData = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data: Project = await res.json();
        setProject(data);
        setJobs(data.renderJobs || []);
        
        // Resolve download URLs for all project files
        const resolvedFiles = await Promise.all(
          (data.projectFiles || []).map(async (file) => {
            try {
              const urlRes = await fetch(`/api/storage/download-url?key=${encodeURIComponent(file.fileUrl)}`);
              if (urlRes.ok) {
                const urlData = await urlRes.json();
                return { ...file, downloadUrl: urlData.url };
              }
            } catch (err) {
              console.error('Failed to get download URL:', err);
            }
            return file;
          })
        );
        setFilesList(resolvedFiles);
      }
    } catch (err) {
      console.error('Failed to load project details:', err);
    } finally {
      setIsLoading(false);
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
      console.error('Failed to fetch job details:', err);
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
    fetchProjectData();
    checkWorkerAvailability();
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => {
      checkWorkerAvailability();
      fetchProjectData();
      if (isDrawerOpen && selectedJob) {
        fetchJobDetails(selectedJob.id);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [jobs, isDrawerOpen, selectedJob]);

  const handleLaunchRender = async () => {
    if (!project) return;
    if (filesList.length === 0) {
      alert('Cannot launch render job. Please upload at least one image input file first.');
      return;
    }
    
    setIsLaunchingJob(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          settingsJson: JSON.stringify({
            stylePreference: project.stylePreference,
            sceneType: project.sceneType,
            projectType: project.projectType
          })
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to queue render job');
      }

      await fetchProjectData();
    } catch (err: any) {
      console.error('[Launch Job Error]:', err.message);
      alert(err.message || 'An error occurred while queueing the render job.');
    } finally {
      setIsLaunchingJob(false);
    }
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

      await fetchProjectData();
      
      if (selectedJob?.id === jobId) {
        fetchJobDetails(jobId);
      }
    } catch (err: any) {
      console.error('[Cancel Job Error]:', err.message);
      alert(err.message || 'Failed to cancel the render job.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setUploadError(null);

    // 1. Enforce direct validation rules
    const filename = selectedFile.name;
    const fileExtension = filename.split('.').pop()?.toLowerCase() || '';
    const imageExtensions = ['png', 'jpg', 'jpeg', 'webp'];
    const modelExtensions = ['blend', 'glb', 'obj', 'fbx', 'zip'];

    // If it's a 3D model file, show the placeholder warning
    if (modelExtensions.includes(fileExtension)) {
      setUploadError('3D Model upload (e.g. .blend, .glb) is coming in a future update. Please upload reference image inputs (.png, .jpg, .jpeg, .webp) for ControlNet extraction first.');
      return;
    }

    if (!imageExtensions.includes(fileExtension)) {
      setUploadError('Unsupported file type. Please upload images (.png, .jpg, .jpeg, .webp) only.');
      return;
    }

    setUploadProgress(10);
    try {
      // 2. Request upload URL from adapter gateway
      const uploadUrlRes = await fetch('/api/storage/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          folder: 'inputs',
          filename: filename,
          contentType: selectedFile.type,
        }),
      });

      if (!uploadUrlRes.ok) {
        throw new Error('Failed to retrieve upload parameters.');
      }

      const { url, method, key } = await uploadUrlRes.json();
      setUploadProgress(40);

      // 3. Perform browser-direct binary upload
      const uploadRes = await fetch(url, {
        method: method, // PUT for S3, POST for local dev fallback
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload file to storage.');
      }
      setUploadProgress(80);

      // 4. Save metadata records in Neon DB
      const metaRes = await fetch(`/api/projects/${id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: filename,
          key: key,
          fileType: selectedFile.type,
          metadata: {
            size: `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`,
            uploadedAt: new Date().toISOString(),
          },
        }),
      });

      if (!metaRes.ok) {
        throw new Error('Failed to register file metadata in database.');
      }

      setUploadProgress(100);
      setTimeout(() => {
        setUploadProgress(null);
        fetchProjectData();
      }, 500);

    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'An error occurred during file upload.');
      setUploadProgress(null);
    }
  };

  const handleApproveRender = async (renderId: string) => {
    // Mock approve for UI
    if (!project) return;
    setProject({
      ...project,
      renders: project.renders.map(r => r.id === renderId ? { ...r, status: 'approved', rating: 5 } : r)
    });
  };

  const handleRejectRender = async (renderId: string) => {
    // Mock reject for UI
    if (!project) return;
    setProject({
      ...project,
      renders: project.renders.map(r => r.id === renderId ? { ...r, status: 'rejected' } : r)
    });
  };

  const handleDeleteFile = async (fileId: string, fileKey: string) => {
    try {
      // Direct call to local/s3 delete (can mock this or make API later)
      setFilesList(filesList.filter(f => f.id !== fileId));
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
        <span className="text-xs text-slate-450 mt-3">Loading project details...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="h-12 w-12 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-200 mt-4">Project not found</h2>
        <Link href="/projects" className="text-xs text-indigo-400 hover:underline mt-2 inline-block">Return to list</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back button */}
      <div>
        <Link 
          href="/projects" 
          className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Projects</span>
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-400 bg-clip-text text-transparent">
              {project.name}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">Style Preference: {project.stylePreference}</p>
          </div>
          <button
            onClick={handleLaunchRender}
            disabled={isLaunchingJob}
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-sm font-semibold px-4.5 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/20 transform transition-all duration-200 active:scale-95 w-fit disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLaunchingJob ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <Play className="h-4.5 w-4.5" />
            )}
            <span>{isLaunchingJob ? 'Queueing Job...' : 'Launch Render Job'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: Files and Render Gallery */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-slate-900 bg-slate-950/20 px-4">
              <button
                onClick={() => setActiveTab('files')}
                className={`px-4 py-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'files' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                CAD & Image Inputs ({filesList.length})
              </button>
              <button
                onClick={() => setActiveTab('renders')}
                className={`px-4 py-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'renders' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Render Outputs ({(project.renders || []).length})
              </button>
            </div>

            <div className="p-6">
              {activeTab === 'files' ? (
                /* Files and uploads */
                <div className="space-y-6">
                  
                  {/* File Upload zone */}
                  <div>
                    <label className="border border-dashed border-slate-900 hover:border-slate-800 rounded-lg p-6 text-center cursor-pointer hover:bg-slate-900/10 transition-colors block relative">
                      <input 
                        type="file" 
                        className="hidden" 
                        onChange={handleFileUpload}
                        disabled={uploadProgress !== null}
                        accept="image/*,.blend,.glb,.obj,.fbx"
                      />
                      <Upload className="h-7 w-7 text-indigo-400 mx-auto" />
                      <h3 className="text-xs font-bold text-slate-300 mt-2.5">Upload image inputs (.png, .jpg, .jpeg, .webp)</h3>
                      <p className="text-[10px] text-slate-500 mt-1">Direct upload to S3/Local cache. 3D models will show placeholder warnings.</p>
                      
                      {uploadProgress !== null && (
                        <div className="max-w-xs mx-auto mt-4">
                          <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                            <div 
                              className="bg-indigo-500 h-full transition-all duration-150"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1.5 block">Uploading file... {uploadProgress}%</span>
                        </div>
                      )}
                    </label>

                    {uploadError && (
                      <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-450 flex items-start space-x-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                        <span>{uploadError}</span>
                      </div>
                    )}
                  </div>

                  {/* 3D Model placeholder placeholder notification */}
                  <div className="p-4.5 rounded-lg bg-slate-950 border border-slate-900 flex items-start space-x-3.5">
                    <FolderOpen className="h-5 w-5 text-indigo-400/80 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-300">3D Design Models (Blender/CAD)</h4>
                      <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                        [Planned Feature] Drag-and-drop support for `.blend` scene hierarchies and `.glb` mesh models will be integrated in the next milestone release to feed the local asset extraction worker directly.
                      </p>
                    </div>
                  </div>

                  {/* File Lists / Previews grid */}
                  <div className="space-y-4 pt-4 border-t border-slate-900/60">
                    <h3 className="text-xs font-bold text-slate-450 uppercase tracking-wider">Uploaded Assets</h3>
                    
                    {filesList.length === 0 ? (
                      <p className="text-slate-500 text-xs italic">No assets uploaded yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {filesList.map((file) => {
                          const isImage = file.fileType.startsWith('image/');
                          const meta = JSON.parse(file.metadataJson || '{}');
                          return (
                            <div key={file.id} className="bg-slate-950 border border-slate-900 rounded-lg overflow-hidden flex flex-col justify-between">
                              {isImage && file.downloadUrl ? (
                                <div className="aspect-video relative bg-slate-900">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img 
                                    src={file.downloadUrl} 
                                    alt="Reference pass" 
                                    className="object-cover w-full h-full"
                                  />
                                </div>
                              ) : (
                                <div className="aspect-video flex items-center justify-center bg-slate-900 text-indigo-500/60">
                                  <FileText className="h-8 w-8" />
                                </div>
                              )}

                              <div className="p-3.5 flex items-center justify-between gap-2 border-t border-slate-900">
                                <div className="min-w-0">
                                  <h4 className="text-xs font-semibold text-slate-200 truncate" title={file.fileUrl}>
                                    {file.fileUrl.split('/').pop()}
                                  </h4>
                                  <p className="text-[9px] text-slate-500 mt-0.5">{meta.size || 'Unknown Size'}</p>
                                </div>
                                <button
                                  onClick={() => handleDeleteFile(file.id, file.fileUrl)}
                                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-900/50 transition-all"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                /* Renders outputs tab */
                (project.renders || []).length === 0 ? (
                  <div className="text-center py-12">
                    <Sliders className="h-10 w-10 text-slate-600 mx-auto" />
                    <p className="text-slate-400 text-sm mt-3">No images rendered yet. Click &apos;Launch Render Job&apos; to begin.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {project.renders.map((render) => (
                      <div key={render.id} className="bg-slate-950 border border-slate-900 rounded-lg overflow-hidden flex flex-col">
                        <div className="relative aspect-video bg-slate-900">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={render.previewUrl} 
                            alt={`Seed: ${render.seed}`} 
                            className="object-cover w-full h-full"
                          />
                          <div className="absolute top-2.5 right-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${render.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : render.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' : 'bg-slate-800 text-slate-450 border border-slate-700'}`}>
                              {render.status}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center justify-between text-xs text-slate-455">
                              <span>Seed: {render.seed}</span>
                              <span>{new Date(render.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Style: {render.style}</p>
                          </div>

                          {render.status === 'pending' ? (
                            <div className="flex items-center gap-2 pt-2 border-t border-slate-900">
                              <button
                                onClick={() => handleApproveRender(render.id)}
                                className="flex-1 inline-flex items-center justify-center space-x-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold py-2 rounded border border-emerald-500/20 transition-colors"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => handleRejectRender(render.id)}
                                className="flex-1 inline-flex items-center justify-center space-x-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold py-2 rounded border border-rose-500/20 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs">
                              <span className="text-slate-500 font-medium">Review Complete</span>
                              <div className="flex items-center space-x-1">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star 
                                    key={s} 
                                    className={`h-3.5 w-3.5 ${s <= render.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}`} 
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Right column: Details and jobs */}
        <div className="space-y-6">
          
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-200 pb-3 border-b border-slate-900">
              Project Parameters
            </h2>
            
            <div className="space-y-3.5">
              <div>
                <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Project Type</span>
                <span className="text-xs font-semibold text-slate-350 bg-slate-950 border border-slate-900 px-3 py-1.5 rounded block">{project.projectType}</span>
              </div>
              
              <div>
                <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Scene Type</span>
                <span className="text-xs font-semibold text-slate-350 bg-slate-950 border border-slate-900 px-3 py-1.5 rounded block">{project.sceneType}</span>
              </div>

              <div>
                <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Directives Notes</span>
                <p className="text-xs text-slate-450 bg-slate-950 border border-slate-900 px-3 py-2.5 rounded leading-relaxed whitespace-pre-wrap">
                  {project.notes || 'No design notes provided.'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-200 pb-3 border-b border-slate-900 flex items-center justify-between">
              <span>Render Jobs Pipeline</span>
              <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                {jobs.length} Total
              </span>
            </h2>
            
            <div className="mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {jobs.length === 0 ? (
                <p className="text-slate-500 text-xs italic">No render jobs queued or processed for this project.</p>
              ) : (
                jobs.map((job) => (
                  <div 
                    key={job.id} 
                    onClick={() => handleOpenDrawer(job)}
                    className="p-3.5 rounded-lg bg-slate-950 hover:bg-slate-905 border border-slate-900 hover:border-slate-800 transition-all cursor-pointer space-y-2.5 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-300 truncate max-w-[120px] group-hover:text-indigo-400 transition-colors">
                        {job.id.replace('job_', '#')}
                      </span>
                      {job.status === 'queued' && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">Queued</span>
                      )}
                      {job.status === 'claimed' && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">Claimed</span>
                      )}
                      {job.status === 'processing' && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/25 animate-pulse">Processing</span>
                      )}
                      {job.status === 'completed' && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">Completed</span>
                      )}
                      {(job.status === 'failed' || job.status === 'cancelled') && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/25">Failed</span>
                      )}
                    </div>
                    
                    {job.status === 'queued' && !isWorkerOnline && (
                      <div className="text-[9.5px] font-semibold text-amber-450 bg-amber-500/5 border border-amber-500/10 px-2.5 py-1.5 rounded mt-1.5 leading-normal">
                        Will start when the render machine comes online
                      </div>
                    )}
                    
                    {job.status === 'processing' && (
                      <div className="space-y-1">
                        <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-full" style={{ width: `${job.progress}%` }} />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500">
                          <span>Rendering scene</span>
                          <span>{job.progress}%</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[9px] text-slate-500">
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(job.createdAt).toLocaleTimeString()}</span>
                      </div>
                      
                      {(job.status === 'queued' || job.status === 'claimed' || job.status === 'processing') ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelJob(job.id);
                          }}
                          className="text-[9px] font-bold text-rose-450 hover:text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/10 rounded px-1.5 py-0.5 transition-colors"
                        >
                          Cancel
                        </button>
                      ) : job.workerId ? (
                        <span className="truncate max-w-[80px]">Worker: {job.workerId}</span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

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
                  className="p-1.5 rounded-lg text-slate-450 hover:text-slate-200 hover:bg-slate-850 transition-colors"
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
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-450 border border-slate-700 uppercase tracking-wider">Queued</span>
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
                    {(selectedJob.status === 'failed' || selectedJob.status === 'cancelled') && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/25 uppercase tracking-wider">Failed</span>
                    )}
                  </div>

                  {selectedJob.status === 'queued' && !isWorkerOnline && (
                    <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 text-[11px] text-amber-450 leading-relaxed flex items-start space-x-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-550 mt-0.5" />
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
                    {selectedJob.completedAt && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Finished At</span>
                        <span>{new Date(selectedJob.completedAt).toLocaleString()}</span>
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
                    className="w-full inline-flex items-center justify-center space-x-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-450 hover:text-rose-400 text-xs font-bold py-2.5 rounded-lg border border-rose-500/10 transition-colors"
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
