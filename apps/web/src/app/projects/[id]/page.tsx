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
  Star,
  Sparkles,
  Lock,
  Unlock,
  Plus,
  Database,
  Edit3,
  Share2,
  Copy,
  ExternalLink
} from 'lucide-react';
import { STYLE_PRESETS } from '../../../lib/style-presets';

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
  previewUrl: string | null;
  finalUrl: string | null;
  createdAt: string;
  baseDownloadUrl?: string;
  feedbackDetails?: Record<string, any>;
  feedbackNotes?: string;
}

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
}

interface Project {
  id: string;
  name: string;
  projectType: string;
  sceneType: string;
  stylePreference: string;
  notes: string;
  status: string;
  clientName: string | null;
  projectFiles: ProjectFile[];
  renders: Render[];
  renderJobs: RenderJob[];
  revisionNotes?: any[];
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
  const [activeTab, setActiveTab] = useState<'renders' | 'files' | 'materials' | 'deliveries'>('files');

  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [isLaunchingJob, setIsLaunchingJob] = useState(false);
  const [isUpscalingRenderId, setIsUpscalingRenderId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<RenderJob | null>(null);
  const [jobEvents, setJobEvents] = useState<any[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isWorkerOnline, setIsWorkerOnline] = useState(false);

  // Review drawer state
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);
  const [selectedReviewRender, setSelectedReviewRender] = useState<any>(null);
  const [feedbackApproved, setFeedbackApproved] = useState(true);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackScores, setFeedbackScores] = useState<Record<string, number>>({
    geometry: 5,
    lighting: 5,
    realism: 5,
    material: 5,
    style: 5,
    clientReady: 5
  });
  const [feedbackAction, setFeedbackAction] = useState('regenerate similar');
  const [feedbackRejections, setFeedbackRejections] = useState<string[]>([]);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackClientName, setFeedbackClientName] = useState('');
  const [feedbackReason, setFeedbackReason] = useState('');
  const [feedbackRequestedChange, setFeedbackRequestedChange] = useState('');
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  // Launch Modal State
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [selectedStylePreset, setSelectedStylePreset] = useState('style_mod_lux_ext');
  const [selectedSceneType, setSelectedSceneType] = useState('Exterior');
  const [selectedProjectType, setSelectedProjectType] = useState('Residential');
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [selectedGeometryLockMode, setSelectedGeometryLockMode] = useState('accurate');
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [promptModifier, setPromptModifier] = useState('');

  // Share Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareSelectedRenders, setShareSelectedRenders] = useState<string[]>([]);
  const [sharePassword, setSharePassword] = useState('');
  const [shareCommentsEnabled, setShareCommentsEnabled] = useState(true);
  const [generatedShareLink, setGeneratedShareLink] = useState('');
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [projectDeliveries, setProjectDeliveries] = useState<any[]>([]);

  // Material Mapping State
  const [materialMappings, setMaterialMappings] = useState<any[]>([]);
  const [materialSuggestions, setMaterialSuggestions] = useState<any[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('wall');
  const [newFinish, setNewFinish] = useState('');
  const [newLocked, setNewLocked] = useState(false);
  const [isSavingMaterial, setIsSavingMaterial] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);

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

        // Resolve download URLs for all renders to populate previewUrl, finalUrl, and baseDownloadUrl, and load feedback
        const resolvedRenders = await Promise.all(
          (data.renders || []).map(async (render: any) => {
            let resolvedPreviewUrl = null;
            let resolvedFinalUrl = null;
            let baseDownloadUrl = null;
            
            // Resolve previewUrl (or fallback to finalImageUrl if previewUrl not in DB yet)
            const previewKey = render.previewUrl || render.finalImageUrl;
            if (previewKey) {
              try {
                const urlRes = await fetch(`/api/storage/download-url?key=${encodeURIComponent(previewKey)}`);
                if (urlRes.ok) {
                  const urlData = await urlRes.json();
                  resolvedPreviewUrl = urlData.url;
                }
              } catch (err) {
                console.error('Failed to get download URL for render preview:', err);
              }
            }

            // Resolve finalUrl
            if (render.finalUrl) {
              try {
                const urlRes = await fetch(`/api/storage/download-url?key=${encodeURIComponent(render.finalUrl)}`);
                if (urlRes.ok) {
                  const urlData = await urlRes.json();
                  resolvedFinalUrl = urlData.url;
                }
              } catch (err) {
                console.error('Failed to get download URL for render final:', err);
              }
            }

            if (render.baseImageUrl) {
              try {
                const baseRes = await fetch(`/api/storage/download-url?key=${encodeURIComponent(render.baseImageUrl)}`);
                if (baseRes.ok) {
                  const baseData = await baseRes.json();
                  baseDownloadUrl = baseData.url;
                }
              } catch (err) {
                console.error('Failed to get download URL for base image:', err);
              }
            }

            let status = 'pending';
            let rating = 0;
            let feedbackDetails = {};
            let feedbackNotes = '';

            if (render.feedback) {
              status = render.feedback.approved ? 'approved' : 'rejected';
              rating = render.feedback.rating || 0;
              feedbackNotes = render.feedback.notes || '';
              try {
                feedbackDetails = JSON.parse(render.feedback.scoresJson || '{}');
              } catch {
                feedbackDetails = {};
              }
            }

            return {
              ...render,
              previewUrl: resolvedPreviewUrl,
              finalUrl: resolvedFinalUrl,
              baseDownloadUrl,
              status,
              style: render.styleId ? render.styleId.replace('style_', '').replace(/_/g, ' ') : 'Custom Style',
              rating,
              feedbackDetails,
              feedbackNotes
            };
          })
        );

        setProject({
          ...data,
          renders: resolvedRenders
        });
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

  const fetchMaterials = async () => {
    setIsLoadingMaterials(true);
    try {
      const res = await fetch(`/api/projects/${id}/materials?include_suggestions=true`);
      if (res.ok) {
        const data = await res.json();
        setMaterialMappings(data.mappings || []);
        setMaterialSuggestions(data.suggestions || []);
      }
    } catch (err) {
      console.error('Failed to fetch material mappings:', err);
    } finally {
      setIsLoadingMaterials(false);
    }
  };

  const handleSaveMaterialMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory || !newFinish.trim()) {
      alert('Please fill out the category and desired finish.');
      return;
    }

    setIsSavingMaterial(true);
    try {
      const res = await fetch(`/api/projects/${id}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingMaterialId || undefined,
          objectName: newZoneName.trim() || selectedCategory,
          detectedClass: selectedCategory,
          selectedMaterial: newFinish.trim(),
          locked: newLocked
        })
      });

      if (res.ok) {
        const saved = await res.json();
        if (editingMaterialId) {
          setMaterialMappings(materialMappings.map(m => m.id === editingMaterialId ? saved : m));
        } else {
          setMaterialMappings([...materialMappings, saved]);
        }
        // Reset form
        setNewZoneName('');
        setSelectedCategory('wall');
        setNewFinish('');
        setNewLocked(false);
        setEditingMaterialId(null);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save material mapping');
      }
    } catch (err) {
      console.error('Error saving material:', err);
    } finally {
      setIsSavingMaterial(false);
    }
  };

  const handleEditMaterial = (mapping: any) => {
    setEditingMaterialId(mapping.id);
    setNewZoneName(mapping.objectName);
    setSelectedCategory(mapping.detectedClass);
    setNewFinish(mapping.selectedMaterial);
    setNewLocked(mapping.locked);
  };

  const handleDeleteMaterial = async (mappingId: string) => {
    if (!confirm('Are you sure you want to delete this material mapping?')) return;

    try {
      const res = await fetch(`/api/projects/${id}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mappingId,
          action: 'delete'
        })
      });

      if (res.ok) {
        setMaterialMappings(materialMappings.filter(m => m.id !== mappingId));
      } else {
        alert('Failed to delete mapping');
      }
    } catch (err) {
      console.error('Error deleting material:', err);
    }
  };

  const handleApplySuggestion = (suggestion: any) => {
    setNewZoneName(`${suggestion.category.charAt(0).toUpperCase() + suggestion.category.slice(1)} Zone`);
    setSelectedCategory(suggestion.category);
    setNewFinish(suggestion.finish);
    setNewLocked(true);
    setEditingMaterialId(null);
  };

  const fetchDeliveries = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/deliveries`);
      if (res.ok) {
        const data = await res.json();
        setProjectDeliveries(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch project deliveries:', err);
    }
  };

  useEffect(() => {
    fetchProjectData();
    checkWorkerAvailability();
    fetchMaterials();
    fetchDeliveries();
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

  const getUpscaleJobForRender = (renderId: string) => {
    return jobs.find(job => {
      if (['completed', 'failed', 'cancelled'].includes(job.status)) return false;
      try {
        const settings = JSON.parse(job.settingsJson || '{}');
        return (settings.job_type === 'upscale_selected' || settings.jobType === 'upscale_selected') && settings.renderId === renderId;
      } catch {
        return false;
      }
    });
  };

  const handleUpscaleSelected = async (renderId: string) => {
    if (!project) return;
    setIsUpscalingRenderId(renderId);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          settingsJson: JSON.stringify({
            job_type: 'upscale_selected',
            renderId: renderId
          })
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to queue upscale job');
      }

      await fetchProjectData();
    } catch (err: any) {
      console.error('[Upscale Error]:', err.message);
      alert(err.message || 'An error occurred while queueing the upscale job.');
    } finally {
      setIsUpscalingRenderId(null);
    }
  };

  const openLaunchModal = () => {
    if (!project) return;
    if (filesList.length === 0) {
      alert('Cannot launch render job. Please upload at least one image input file first.');
      return;
    }
    
    // Pre-populate settings from project metadata
    const matchingPreset = STYLE_PRESETS.find(
      s => s.id === project.stylePreference || s.name.toLowerCase() === (project.stylePreference || '').toLowerCase()
    );
    
    const activeSceneType = project.sceneType || 'Exterior';
    let stylePresetId = matchingPreset?.id || 'style_mod_lux_ext';
    let geometryMode = matchingPreset?.defaultGeometryLockMode || 'accurate';

    // Verify compatibility of current preset with the active sceneType
    const stylePreset = STYLE_PRESETS.find(s => s.id === stylePresetId);
    if (stylePreset && stylePreset.allowedSceneTypes && !stylePreset.allowedSceneTypes.includes(activeSceneType)) {
      const fallbackPreset = STYLE_PRESETS.find(s => !s.allowedSceneTypes || s.allowedSceneTypes.includes(activeSceneType));
      if (fallbackPreset) {
        stylePresetId = fallbackPreset.id;
        geometryMode = fallbackPreset.defaultGeometryLockMode;
      }
    }

    setSelectedStylePreset(stylePresetId);
    setSelectedSceneType(activeSceneType);
    setSelectedProjectType(project.projectType || 'Residential');
    setSelectedMaterials([]);
    setSelectedGeometryLockMode(geometryMode);
    setIsLaunchModalOpen(true);
  };

  const handleLaunchRenderConfirm = async () => {
    if (!project) return;
    
    setIsLaunchingJob(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          forceRegenerate: forceRegenerate,
          settingsJson: JSON.stringify({
            styleId: selectedStylePreset,
            sceneType: selectedSceneType,
            projectType: selectedProjectType,
            materialChoices: selectedMaterials,
            geometryLockMode: selectedGeometryLockMode,
            promptModifier: promptModifier.trim() || undefined
          })
        })
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(responseData.error || 'Failed to queue render job');
      }

      // Handle cache hit: API returns 200 with cached render
      if (responseData.cached) {
        alert('Cache hit! An identical render already exists. Showing existing result. Use "Bypass Cache" to force a new render.');
      }

      setIsLaunchModalOpen(false);
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

  const REJECTION_REASONS = [
    'geometry changed',
    'bad windows',
    'wrong material',
    'too fake',
    'too dark',
    'not premium enough',
    'distorted furniture',
    'wrong style'
  ];

  const handleOpenReviewDrawer = (render: any) => {
    setSelectedReviewRender(render);
    
    const details = render.feedbackDetails || {};
    const scores = details.scores || {};
    
    setFeedbackApproved(render.status === 'approved' || render.status === 'pending');
    setFeedbackRating(render.rating || 5);
    setFeedbackScores({
      geometry: scores.geometry || 5,
      lighting: scores.lighting || 5,
      realism: scores.realism || 5,
      material: scores.material || 5,
      style: scores.style || 5,
      clientReady: scores.clientReady || 5
    });
    setFeedbackAction(details.action || 'regenerate similar');
    setFeedbackRejections(details.rejectionReasons || []);
    setFeedbackNotes(render.feedbackNotes || '');
    setFeedbackClientName(project?.clientName || '');
    setFeedbackReason('');
    setFeedbackRequestedChange('');
    
    setIsReviewDrawerOpen(true);
  };

  const handleCloseReviewDrawer = () => {
    setIsReviewDrawerOpen(false);
    setSelectedReviewRender(null);
    setFeedbackClientName('');
    setFeedbackReason('');
    setFeedbackRequestedChange('');
  };

  const toggleRejectionReason = (reason: string) => {
    if (feedbackRejections.includes(reason)) {
      setFeedbackRejections(feedbackRejections.filter(r => r !== reason));
    } else {
      setFeedbackRejections([...feedbackRejections, reason]);
    }
  };

  const handleSaveFeedback = async () => {
    if (!selectedReviewRender) return;
    
    setIsSavingFeedback(true);
    try {
      const res = await fetch(`/api/renders/${selectedReviewRender.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: feedbackApproved,
          rating: feedbackRating,
          scores: feedbackScores,
          action: feedbackAction,
          rejectionReasons: feedbackApproved ? [] : feedbackRejections,
          notes: feedbackNotes,
          clientName: feedbackClientName.trim() || null,
          reason: feedbackReason.trim() || null,
          requestedChange: feedbackRequestedChange.trim() || null
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save feedback');
      }

      setIsReviewDrawerOpen(false);
      await fetchProjectData();
    } catch (err: any) {
      console.error('[Save Feedback Error]:', err.message);
      alert(err.message || 'Failed to save render feedback.');
    } finally {
      setIsSavingFeedback(false);
    }
  };

  const handleCreateShareLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shareSelectedRenders.length === 0) {
      alert('Please select at least one render output to share.');
      return;
    }

    setIsGeneratingShare(true);
    try {
      const res = await fetch(`/api/projects/${id}/deliveries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: sharePassword.trim() || undefined,
          commentsEnabled: shareCommentsEnabled,
          renderIds: shareSelectedRenders
        })
      });

      if (res.ok) {
        const data = await res.json();
        const origin = window.location.origin;
        const link = `${origin}/deliveries/${data.token}`;
        setGeneratedShareLink(link);
        await fetchDeliveries();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create sharing link.');
      }
    } catch (err) {
      console.error('Failed to create delivery link:', err);
      alert('An error occurred while creating the sharing link.');
    } finally {
      setIsGeneratingShare(false);
    }
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
            onClick={openLaunchModal}
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
              <button
                onClick={() => setActiveTab('materials')}
                className={`px-4 py-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'materials' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Material Board ({materialMappings.length})
              </button>
              <button
                onClick={() => setActiveTab('deliveries')}
                className={`px-4 py-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'deliveries' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Client Shares ({projectDeliveries.length})
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
                    <h3 className="text-xs font-bold text-slate-455 uppercase tracking-wider">Uploaded Assets</h3>
                    
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
                                  className="p-1.5 text-slate-500 hover:text-rose-450 rounded hover:bg-slate-900/50 transition-all"
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
              ) : activeTab === 'renders' ? (
                /* Renders outputs tab */
                (project.renders || []).length === 0 ? (
                  <div className="text-center py-12">
                    <Sliders className="h-10 w-10 text-slate-650 mx-auto" />
                    <p className="text-slate-400 text-sm mt-3">No images rendered yet. Click &apos;Launch Render Job&apos; to begin.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {project.renders.map((render) => (
                      <div key={render.id} className="bg-slate-950 border border-slate-900 rounded-lg overflow-hidden flex flex-col">
                        <div className="relative aspect-video bg-slate-900">
                          {/* Side-by-side comparison grid */}
                          <div className="grid grid-cols-2 h-full w-full relative">
                            {/* Left: Input image */}
                            <div className="relative border-r border-slate-900/60 overflow-hidden h-full">
                              {render.baseDownloadUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img 
                                  src={render.baseDownloadUrl} 
                                  alt="Original Input" 
                                  className="object-cover w-full h-full"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full text-slate-600 text-[10px]">No input file</div>
                              )}
                              <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-slate-950/80 text-slate-400 text-[8px] font-bold rounded uppercase tracking-wider">Original Input</span>
                            </div>
                            {/* Right: Render variation output */}
                            <div className="relative overflow-hidden h-full bg-slate-950">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img 
                                src={render.finalUrl || render.previewUrl || ''} 
                                alt={`Seed: ${render.seed}`} 
                                className="object-cover w-full h-full"
                              />
                              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-indigo-950/80 text-indigo-400 text-[8px] font-bold rounded uppercase tracking-wider">Render Output</span>

                              {/* Preview / Upscaled Badge */}
                              <span className={`absolute top-2.5 left-2.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shadow-sm border ${render.finalUrl ? 'bg-emerald-950/95 text-emerald-400 border-emerald-500/30' : 'bg-amber-950/95 text-amber-400 border-amber-500/30'}`}>
                                {render.finalUrl ? 'Upscaled' : 'Preview'}
                              </span>
                            </div>
                          </div>
                          <div className="absolute top-2.5 right-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${render.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : render.status === 'rejected' ? 'bg-rose-500/10 text-rose-450 border border-rose-500/25' : 'bg-slate-800 text-slate-450 border border-slate-700'}`}>
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

                          {(() => {
                            const upscaleJob = getUpscaleJobForRender(render.id);
                            return (
                              <div className="flex items-center gap-2 pt-2 border-t border-slate-900 w-full">
                                <button
                                  onClick={() => handleOpenReviewDrawer(render)}
                                  className="flex-1 inline-flex items-center justify-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-semibold py-2.5 rounded-lg transition-colors shadow-md"
                                >
                                  <Sliders className="h-3.5 w-3.5" />
                                  <span>{render.status === 'pending' ? 'Review' : 'Feedback'}</span>
                                </button>

                                {upscaleJob ? (
                                  <button
                                    disabled
                                    className="flex-1 inline-flex items-center justify-center space-x-1.5 bg-slate-900 text-slate-500 text-xs font-semibold py-2.5 rounded-lg border border-slate-850 cursor-not-allowed"
                                  >
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>
                                      {upscaleJob.status === 'queued' ? 'Queued' : `${upscaleJob.progress}%`}
                                    </span>
                                  </button>
                                ) : render.finalUrl ? (
                                  <div className="flex-1 inline-flex items-center justify-center space-x-1.5 bg-emerald-950/40 text-emerald-400 text-xs font-semibold py-2.5 rounded-lg border border-emerald-500/20">
                                    <Check className="h-3.5 w-3.5" />
                                    <span>Upscaled</span>
                                  </div>
                                ) : (
                                  <button
                                    disabled={isUpscalingRenderId !== null}
                                    onClick={() => handleUpscaleSelected(render.id)}
                                    className="flex-1 inline-flex items-center justify-center space-x-1.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-400 text-xs font-semibold py-2.5 rounded-lg border border-indigo-500/20 transition-colors shadow-md disabled:opacity-50"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    <span>Upscale</span>
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : activeTab === 'materials' ? (
                /* Material board tab */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column: Form Editor */}
                  <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 space-y-4 h-fit">
                    <h3 className="text-sm font-bold text-slate-200">
                      {editingMaterialId ? 'Edit Material Specification' : 'Add Material Specification'}
                    </h3>
                    <form onSubmit={handleSaveMaterialMapping} className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                          Zone / Object Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Dining floor, East window frame"
                          value={newZoneName}
                          onChange={(e) => setNewZoneName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-205 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                            Material Category
                          </label>
                          <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-250 focus:outline-none focus:border-indigo-500"
                          >
                            {['wall', 'floor', 'ceiling', 'glass', 'frame', 'wood', 'stone', 'concrete', 'metal', 'vegetation', 'furniture', 'sky', 'roof', 'door'].map((cat) => (
                              <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                          Desired Finish / Material Type
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. polished walnut, brushed travertine, clear double-glazed"
                          value={newFinish}
                          onChange={(e) => setNewFinish(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-205 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                          required
                        />
                      </div>

                      <div className="flex items-center space-x-2.5 pt-2">
                        <input
                          type="checkbox"
                          id="locked-checkbox"
                          checked={newLocked}
                          onChange={(e) => setNewLocked(e.target.checked)}
                          className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer h-4 w-4"
                        />
                        <label htmlFor="locked-checkbox" className="text-xs text-slate-300 font-medium select-none cursor-pointer flex items-center space-x-1.5">
                          <Lock className="h-3.5 w-3.5 text-indigo-400" />
                          <span>Lock Composition Mapping</span>
                        </label>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        When locked, this finish details description is automatically merged into the rendering prompts to enforce consistency.
                      </p>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="submit"
                          disabled={isSavingMaterial}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
                        >
                          {isSavingMaterial ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : editingMaterialId ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          <span>{editingMaterialId ? 'Save Changes' : 'Add to Specification'}</span>
                        </button>
                        {editingMaterialId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMaterialId(null);
                              setNewZoneName('');
                              setSelectedCategory('wall');
                              setNewFinish('');
                              setNewLocked(false);
                            }}
                            className="bg-slate-800 hover:bg-slate-750 text-slate-350 text-xs font-bold py-2.5 px-3.5 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </form>
                  </div>

                  {/* Right Column: List */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-455 uppercase tracking-wider">
                        Active Material Board Specification ({materialMappings.length})
                      </h3>
                      {isLoadingMaterials && <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />}
                    </div>

                    {materialSuggestions.length > 0 && (
                      <div className="bg-slate-900/20 border border-slate-900/60 rounded-xl p-5 space-y-4">
                        <div className="flex items-center space-x-2">
                          <Sparkles className="h-4 w-4 text-indigo-400" />
                          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                            Suggested Finishes from Past Projects
                          </h4>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Based on other projects using <strong>{project?.projectType} + {project?.sceneType} + {project?.stylePreference}</strong>. Click any suggestion to load it into the editor.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {materialSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.id}
                              type="button"
                              onClick={() => handleApplySuggestion(suggestion)}
                              className="text-left bg-slate-950 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 rounded-xl p-3.5 flex items-center justify-between group transition-all duration-300"
                            >
                              <div className="min-w-0 pr-3">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-indigo-950/40 text-indigo-400 border border-indigo-500/10 mb-1.5">
                                  {suggestion.category}
                                </span>
                                <h5 className="text-xs font-semibold text-slate-300 italic truncate group-hover:text-white transition-colors">
                                  &ldquo;{suggestion.finish}&rdquo;
                                </h5>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="block text-[8px] font-bold text-slate-550 uppercase tracking-wider">
                                  Used {suggestion.successCount}x
                                </span>
                                <span className="inline-flex items-center text-[10px] text-indigo-400 font-semibold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span>Apply</span>
                                  <Plus className="h-3 w-3 ml-0.5" />
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {materialMappings.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-slate-900 rounded-xl bg-slate-950/20">
                        <Database className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                        <p className="text-slate-500 text-xs italic">No materials specified for this project yet.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {materialMappings.map((mapping) => (
                          <div 
                            key={mapping.id}
                            className={`bg-slate-950 border rounded-xl p-4.5 flex flex-col justify-between space-y-3.5 relative transition-all duration-300 ${
                              mapping.locked 
                                ? 'border-indigo-500/20 shadow-[0_0_12px_rgba(99,102,241,0.03)]' 
                                : 'border-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-slate-200 truncate">{mapping.objectName}</h4>
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-slate-900 text-slate-400 border border-slate-800">
                                  {mapping.detectedClass}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1 shrink-0">
                                {mapping.locked ? (
                                  <span className="flex items-center space-x-1 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/25 rounded text-[8px] font-bold text-indigo-400 uppercase tracking-wider">
                                    <Lock className="h-2.5 w-2.5" />
                                    <span>Locked</span>
                                  </span>
                                ) : (
                                  <span className="flex items-center space-x-1 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                                    <Unlock className="h-2.5 w-2.5" />
                                    <span>Unlocked</span>
                                  </span>
                                )}
                              </div>
                            </div>

                             <div className="bg-slate-900/40 border border-slate-900/60 rounded-lg p-2.5">
                               <span className="block text-[8px] text-slate-550 font-bold uppercase tracking-wider mb-0.5">Finish / Details</span>
                               <span className="text-xs font-medium text-slate-300 italic">&ldquo;{mapping.selectedMaterial}&rdquo;</span>
                               {mapping.correctionSource === 'heuristic' && (
                                 <div className="mt-2 pt-2 border-t border-slate-900/40 flex flex-col gap-1">
                                   <div className="flex items-center space-x-1.5">
                                     <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-bold rounded uppercase tracking-wider">
                                       System Guess: {((mapping.confidence || 0) * 100).toFixed(0)}% Confident
                                     </span>
                                   </div>
                                   {mapping.reason && (
                                     <p className="text-[9.5px] text-slate-400 leading-normal">
                                       <span className="font-semibold text-slate-500">Reason:</span> {mapping.reason}
                                     </p>
                                   )}
                                 </div>
                               )}
                             </div>

                            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-900/60">
                              <button
                                onClick={() => handleEditMaterial(mapping)}
                                className="inline-flex items-center space-x-1 text-slate-500 hover:text-indigo-400 text-[10px] font-bold uppercase tracking-wider transition-colors"
                              >
                                <Edit3 className="h-3 w-3" />
                                <span>Edit</span>
                              </button>
                              <span className="text-slate-800">|</span>
                              <button
                                onClick={() => handleDeleteMaterial(mapping.id)}
                                className="inline-flex items-center space-x-1 text-slate-550 hover:text-rose-450 text-[10px] font-bold uppercase tracking-wider transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Client Shares tab content */
                <div className="space-y-6">
                  <div className="flex items-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-xs font-bold text-slate-455 uppercase tracking-wider">
                      Client Delivery Portals ({projectDeliveries.length})
                    </h3>
                    <button
                      onClick={() => {
                        const finalRenderIds = (project.renders || []).map(r => r.id);
                        setShareSelectedRenders(finalRenderIds);
                        setSharePassword('');
                        setShareCommentsEnabled(true);
                        setGeneratedShareLink('');
                        setIsShareModalOpen(true);
                      }}
                      className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-md w-fit"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create Client Share Link</span>
                    </button>
                  </div>

                  {projectDeliveries.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-900 rounded-xl bg-slate-950/20">
                      <Share2 className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                      <p className="text-slate-550 text-xs italic">No client sharing portals created yet.</p>
                      <p className="text-[10px] text-slate-650 mt-1 max-w-xs mx-auto text-center leading-normal">
                        Generate password-protected presentation spaces for your clients to review outputs and leave comments.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {projectDeliveries.map((delivery) => {
                        let renderIdsCount = 0;
                        try {
                          renderIdsCount = JSON.parse(delivery.rendersJson || '[]').length;
                        } catch {
                          renderIdsCount = 0;
                        }
                        
                        const shareUrl = `${window.location.origin}/deliveries/${delivery.token}`;

                        return (
                          <div key={delivery.id} className="bg-slate-950 border border-slate-900 rounded-xl p-5 flex flex-col justify-between space-y-4">
                            <div>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-slate-200 truncate">Delivery Space</h4>
                                  <p className="text-[9px] text-slate-500 mt-0.5">Created {new Date(delivery.createdAt).toLocaleDateString()}</p>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
                                  delivery.password 
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' 
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                }`}>
                                  {delivery.password ? 'Password' : 'Open'}
                                </span>
                              </div>

                              <div className="mt-3.5 space-y-2 text-[11px] text-slate-450">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Renders Included:</span>
                                  <span className="font-semibold text-slate-300">{renderIdsCount} variations</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-550">Comments Enabled:</span>
                                  <span className="font-semibold text-slate-350">{delivery.commentsEnabled ? 'Yes' : 'No'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-3 border-t border-slate-900/65 w-full">
                              <input
                                type="text"
                                readOnly
                                value={shareUrl}
                                className="flex-1 bg-slate-900 border border-slate-850 rounded px-2.5 py-1 text-[10px] text-slate-450 focus:outline-none select-all font-mono"
                              />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(shareUrl);
                                  alert('Link copied to clipboard!');
                                }}
                                className="p-1.5 bg-slate-900 hover:bg-slate-850 text-slate-450 hover:text-slate-200 rounded border border-slate-850 transition-colors shrink-0"
                                title="Copy sharing link"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <a
                                href={shareUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-400 hover:text-indigo-300 rounded border border-indigo-500/20 transition-colors shrink-0"
                                title="View delivery page"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
              {project.clientName && (
                <div>
                  <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Client Name</span>
                  <span className="text-xs font-semibold text-slate-350 bg-slate-950 border border-slate-900 px-3 py-1.5 rounded block">{project.clientName}</span>
                </div>
              )}
              
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
                        {job.id.replace('job_', '#')} {job.retryCount > 0 && <span className="text-amber-400 font-bold ml-1">(R{job.retryCount})</span>}
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
                      {job.status === 'needs_review' && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/25">Needs Review</span>
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

      {/* Render Review Feedback Drawer */}
      {isReviewDrawerOpen && selectedReviewRender && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity" onClick={handleCloseReviewDrawer} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-200">Evaluate Render Output</h2>
                  <p className="text-[10px] text-slate-550 mt-0.5 font-medium uppercase tracking-wider">Render ID: {selectedReviewRender.id}</p>
                </div>
                <button 
                  onClick={handleCloseReviewDrawer}
                  className="p-1.5 rounded-lg text-slate-450 hover:text-slate-200 hover:bg-slate-850 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Comparison Previews */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-455 uppercase tracking-wider">Comparison Grid</h3>
                  <div className="grid grid-cols-2 gap-3 aspect-video bg-slate-950 border border-slate-850 rounded-xl overflow-hidden">
                    {/* Left: Input */}
                    <div className="relative border-r border-slate-900 overflow-hidden h-full">
                      {selectedReviewRender.baseDownloadUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={selectedReviewRender.baseDownloadUrl} 
                          alt="Original Input" 
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-600 text-[10px] bg-slate-950">No input image</div>
                      )}
                      <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-slate-950/80 text-slate-450 text-[8px] font-bold rounded uppercase tracking-wider">Original Input</span>
                    </div>
                    {/* Right: Output */}
                    <div className="relative overflow-hidden h-full bg-slate-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={selectedReviewRender.finalUrl || selectedReviewRender.previewUrl || ''} 
                        alt="Render Output" 
                        className="object-cover w-full h-full"
                      />
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-indigo-950/80 text-indigo-400 text-[8px] font-bold rounded uppercase tracking-wider">
                        {selectedReviewRender.finalUrl ? 'Upscaled Output' : 'Preview Output'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Approve/Reject Action Toggles */}
                <div className="bg-slate-950 border border-slate-850 rounded-xl p-4.5 space-y-4">
                  <span className="block text-xs font-bold text-slate-350">Evaluation Result</span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFeedbackApproved(true)}
                      className={`flex-1 inline-flex items-center justify-center space-x-2 py-3 rounded-lg border text-sm font-semibold transition-all duration-200 ${feedbackApproved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-lg shadow-emerald-500/5' : 'bg-slate-900/40 text-slate-400 border-slate-850 hover:bg-slate-850'}`}
                    >
                      <Check className="h-4.5 w-4.5" />
                      <span>Approve Final</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeedbackApproved(false)}
                      className={`flex-1 inline-flex items-center justify-center space-x-2 py-3 rounded-lg border text-sm font-semibold transition-all duration-200 ${!feedbackApproved ? 'bg-rose-500/10 text-rose-455 border-rose-500/30 shadow-lg shadow-rose-500/5' : 'bg-slate-900/40 text-slate-400 border-slate-850 hover:bg-slate-850'}`}
                    >
                      <X className="h-4.5 w-4.5" />
                      <span>Reject Render</span>
                    </button>
                  </div>
                </div>

                {/* Sub-ratings Grid */}
                <div className="bg-slate-950 border border-slate-850 rounded-xl p-4.5 space-y-4.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">Quality Ratings</span>
                    <div className="flex items-center space-x-1.5 bg-slate-900 px-3 py-1 rounded-md border border-slate-850">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Overall:</span>
                      <span className="text-xs font-bold text-indigo-400">{feedbackRating}/5</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries({
                      geometry: 'Geometry Detail',
                      lighting: 'Lighting Quality',
                      realism: 'Realism Factor',
                      material: 'Material Texture',
                      style: 'Style Accuracy',
                      clientReady: 'Client Ready'
                    }).map(([key, label]) => {
                      const score = feedbackScores[key as keyof typeof feedbackScores] || 5;
                      return (
                        <div key={key} className="space-y-1.5">
                          <span className="block text-[10.5px] font-semibold text-slate-400">{label}</span>
                          <div className="flex items-center space-x-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => {
                                  const newScores = { ...feedbackScores, [key]: star };
                                  setFeedbackScores(newScores);
                                  const avg = Math.round(
                                    Object.values(newScores).reduce((a, b) => a + b, 0) / 6
                                  );
                                  setFeedbackRating(avg);
                                }}
                                className="focus:outline-none transition-colors"
                              >
                                <Star 
                                  className={`h-4.5 w-4.5 ${star <= score ? 'text-amber-400 fill-amber-400 hover:text-amber-300' : 'text-slate-700 hover:text-slate-655'}`} 
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Modification Requested Action */}
                <div className="bg-slate-950 border border-slate-850 rounded-xl p-4.5 space-y-3.5">
                  <label className="block text-xs font-bold text-slate-300">Render Directive Action</label>
                  <select
                    value={feedbackAction}
                    onChange={(e) => setFeedbackAction(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-850 text-slate-200 text-xs rounded-lg px-3 py-2.5 focus:border-indigo-500 focus:outline-none font-medium"
                  >
                    <option value="none">None - Archive as Final Approve</option>
                    <option value="regenerate similar">Regenerate Similar (New Seed)</option>
                    <option value="request warmer">Request Warmer Temperature Tone</option>
                    <option value="request cleaner">Request Cleaner Minimalist Details</option>
                    <option value="reduce changes">Reduce Changes (Lower Denoise Strength)</option>
                  </select>
                </div>

                {/* Rejection Reasons */}
                {!feedbackApproved && (
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-4.5 space-y-3.5">
                    <span className="block text-xs font-bold text-slate-300">Reasons for Rejection</span>
                    <div className="grid grid-cols-2 gap-2">
                      {REJECTION_REASONS.map((reason) => {
                        const isSelected = feedbackRejections.includes(reason);
                        return (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => toggleRejectionReason(reason)}
                            className={`flex items-center space-x-2 p-2.5 rounded-lg border text-left text-[11px] font-medium transition-all ${isSelected ? 'bg-rose-500/10 text-rose-455 border-rose-500/25' : 'bg-slate-900/50 text-slate-450 border-slate-850 hover:bg-slate-855'}`}
                          >
                            <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-rose-500 border-rose-500 text-slate-100' : 'border-slate-700 bg-slate-950'}`}>
                              {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                            </div>
                            <span className="truncate capitalize">{reason.replace('_', ' ')}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Client Name (Optional) */}
                <div className="bg-slate-950 border border-slate-850 rounded-xl p-4.5 space-y-3.5">
                  <label className="block text-xs font-bold text-slate-300">Client Name (Optional)</label>
                  <input
                    type="text"
                    value={feedbackClientName}
                    onChange={(e) => setFeedbackClientName(e.target.value)}
                    placeholder="e.g. Acme Corporation or John Doe"
                    className="w-full bg-slate-900 border border-slate-850 text-slate-350 text-xs rounded-lg px-3 py-2.5 focus:border-indigo-500 focus:outline-none placeholder-slate-650 font-medium"
                  />
                </div>

                {/* Revision Details (Conditional) */}
                {(!feedbackApproved || (feedbackAction && feedbackAction !== 'none')) && (
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-4.5 space-y-4">
                    <span className="block text-xs font-bold text-slate-300">Revision Details</span>
                    
                    <div className="space-y-1.5">
                      <label className="block text-[10.5px] font-semibold text-slate-400">Reason for Revision</label>
                      <input
                        type="text"
                        value={feedbackReason}
                        onChange={(e) => setFeedbackReason(e.target.value)}
                        placeholder="e.g. Too dark, incorrect wood finish"
                        className="w-full bg-slate-900 border border-slate-850 text-slate-350 text-xs rounded-lg px-3 py-2.5 focus:border-indigo-500 focus:outline-none placeholder-slate-650 font-medium"
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="block text-[10.5px] font-semibold text-slate-400">Requested Change (Prompt Suggestion)</label>
                      <input
                        type="text"
                        value={feedbackRequestedChange}
                        onChange={(e) => setFeedbackRequestedChange(e.target.value)}
                        placeholder="e.g. user prefers warmer lighting"
                        className="w-full bg-slate-900 border border-slate-850 text-slate-355 text-xs rounded-lg px-3 py-2.5 focus:border-indigo-500 focus:outline-none placeholder-slate-650 font-medium"
                      />
                      <p className="text-[10px] text-slate-500 leading-normal">
                        This text will be stored as an interactive prompt modifier suggestion for future jobs.
                      </p>
                    </div>
                  </div>
                )}

                {/* Comments / Notes */}
                <div className="bg-slate-950 border border-slate-850 rounded-xl p-4.5 space-y-3.5">
                  <label className="block text-xs font-bold text-slate-300">Custom Directive Notes</label>
                  <textarea
                    rows={4}
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    placeholder="Enter style comments, materials notes, or adjustments notes here..."
                    className="w-full bg-slate-900 border border-slate-850 text-slate-300 text-xs rounded-lg p-3.5 focus:border-indigo-500 focus:outline-none placeholder-slate-600 font-medium leading-relaxed"
                  />
                </div>
              </div>

              {/* Drawer Save Action Footer */}
              <div className="p-6 border-t border-slate-855 bg-slate-950/20 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseReviewDrawer}
                  className="flex-1 inline-flex items-center justify-center py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveFeedback}
                  disabled={isSavingFeedback}
                  className="flex-1 inline-flex items-center justify-center py-2.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-bold rounded-lg transition-colors shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50"
                >
                  {isSavingFeedback ? 'Saving Evaluated...' : 'Save Feedback'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
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
                    {selectedJob.status === 'needs_review' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25 uppercase tracking-wider">Needs Review</span>
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

      {/* 4. Simplified Launch Render Preset Engine Modal */}
      {isLaunchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop blur overlay */}
          <div 
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setIsLaunchModalOpen(false)}
          />

          <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 text-slate-100">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950/40">
              <div className="flex items-center space-x-2.5">
                <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
                <h2 className="text-lg font-extrabold tracking-wider bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  Launch Architectural Render Job
                </h2>
              </div>
              <button 
                onClick={() => setIsLaunchModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-850 rounded transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[80vh] space-y-6">
              {/* Step 1: Select Style Preset Cards */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">
                  1. Select Visual Preset Style
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {STYLE_PRESETS.filter(style => !style.allowedSceneTypes || style.allowedSceneTypes.includes(selectedSceneType)).map((style) => {
                    const isSelected = selectedStylePreset === style.id;
                    return (
                      <div
                        key={style.id}
                        onClick={() => {
                          setSelectedStylePreset(style.id);
                          setSelectedGeometryLockMode(style.defaultGeometryLockMode);
                        }}
                        className={`flex flex-col p-4 rounded-xl border cursor-pointer text-left transition-all duration-200 select-none group ${
                          isSelected 
                            ? 'bg-indigo-600/10 border-indigo-500/80 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                            : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-900/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <h4 className={`text-xs font-bold transition-colors ${isSelected ? 'text-indigo-400' : 'text-slate-200 group-hover:text-slate-100'}`}>
                            {style.name}
                          </h4>
                          {isSelected && (
                            <span className="p-0.5 rounded-full bg-indigo-500 text-slate-950 flex items-center justify-center shrink-0">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-450 leading-relaxed mb-3 flex-1 font-medium">
                          {style.description}
                        </p>
                        
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-900/60">
                          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                            Geometry
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                            style.defaultGeometryLockMode === 'accurate' || style.defaultGeometryLockMode === 'technical'
                              ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-500/20' 
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}>
                            {style.defaultGeometryLockMode}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Dropdowns for Simple Metadata options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                    2. Scene Type Environment
                  </label>
                  <select
                    value={selectedSceneType}
                    onChange={(e) => {
                      const newSceneType = e.target.value;
                      setSelectedSceneType(newSceneType);
                      
                      // Auto-fallback if currently selected style preset is not compatible with new sceneType
                      const currentPreset = STYLE_PRESETS.find(s => s.id === selectedStylePreset);
                      if (currentPreset && currentPreset.allowedSceneTypes && !currentPreset.allowedSceneTypes.includes(newSceneType)) {
                        const fallbackPreset = STYLE_PRESETS.find(s => !s.allowedSceneTypes || s.allowedSceneTypes.includes(newSceneType));
                        if (fallbackPreset) {
                          setSelectedStylePreset(fallbackPreset.id);
                          setSelectedGeometryLockMode(fallbackPreset.defaultGeometryLockMode);
                        }
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-850 text-xs text-slate-205 p-2.5 rounded-lg focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Exterior">Exterior Perspective</option>
                    <option value="Interior">Interior Perspective</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                    3. Project Typology
                  </label>
                  <select
                    value={selectedProjectType}
                    onChange={(e) => setSelectedProjectType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 text-xs text-slate-205 p-2.5 rounded-lg focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Landscape">Landscape / Urban</option>
                  </select>
                </div>
              </div>

              {/* Step 4: Select Geometry Lock Mode */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">
                  4. Select Geometry Lock Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    {
                      id: 'creative',
                      name: 'Creative',
                      desc: 'More visual freedom, lower composition constraint. Best for early concept iteration.',
                      badge: 'High Freedom'
                    },
                    {
                      id: 'balanced',
                      name: 'Balanced',
                      desc: 'Preserves composition outline while allowing some style/material modifications.',
                      badge: 'Medium Lock'
                    },
                    {
                      id: 'accurate',
                      name: 'Accurate (Recommended)',
                      desc: 'Preserves spatial composition tightly. Ideal default for standard client renders.',
                      badge: 'Strong Lock'
                    },
                    {
                      id: 'technical',
                      name: 'Technical',
                      desc: 'Highest contour alignment, lowest detail variance. Best for blueprints/precise mockups.',
                      badge: 'Max Lock'
                    }
                  ].map((mode) => {
                    const isSelected = selectedGeometryLockMode === mode.id;
                    return (
                      <div
                        key={mode.id}
                        onClick={() => setSelectedGeometryLockMode(mode.id)}
                        className={`flex flex-col p-4.5 rounded-xl border cursor-pointer text-left transition-all duration-200 select-none group ${
                          isSelected 
                            ? 'bg-indigo-600/10 border-indigo-500/80 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                            : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-900/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <h4 className={`text-xs font-bold transition-colors ${isSelected ? 'text-indigo-400' : 'text-slate-200 group-hover:text-slate-100'}`}>
                            {mode.name}
                          </h4>
                          {isSelected && (
                            <span className="p-0.5 rounded-full bg-indigo-500 text-slate-950 flex items-center justify-center shrink-0">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-450 leading-relaxed mb-3 flex-1 font-medium">
                          {mode.desc}
                        </p>
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-900/60">
                          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Constraint</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                            isSelected 
                              ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-500/20' 
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}>
                            {mode.badge}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 5: Click-to-select Material Vibe tags */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2.5">
                  5. Add Material Accent Vibes
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Glass & Steel', 'Concrete Minimalism', 'Warm Oak Wood', 'Brushed Brass', 'Travertine Stone', 'Polished Terrazzo', 'Exposed Brick', 'Matte Black Metal'].map((mat) => {
                    const isSelected = selectedMaterials.includes(mat);
                    return (
                      <button
                        key={mat}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedMaterials(selectedMaterials.filter(m => m !== mat));
                          } else {
                            setSelectedMaterials([...selectedMaterials, mat]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all duration-150 uppercase tracking-wider ${
                          isSelected 
                            ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/30' 
                            : 'bg-slate-950/40 text-slate-400 border-slate-850 hover:text-slate-350 hover:border-slate-750'
                        }`}
                      >
                        {mat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 6: Custom Prompt Modifier & Suggestions */}
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-5 space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                    6. Custom Prompt Modifier
                  </label>
                  <input
                    type="text"
                    value={promptModifier}
                    onChange={(e) => setPromptModifier(e.target.value)}
                    placeholder="e.g. user prefers warmer lighting, reduce greenery"
                    className="w-full bg-slate-900 border border-slate-850 text-slate-200 text-xs rounded-lg px-3 py-2.5 focus:border-indigo-500 focus:outline-none placeholder-slate-600 font-medium"
                  />
                  <p className="text-[10px] text-slate-500 mt-1.5 leading-normal">
                    This modifier is appended to the compiled prompt. You can accept suggestions from previous revisions below, edit them, or type your own.
                  </p>
                </div>

                {project?.revisionNotes && project.revisionNotes.length > 0 && (
                  <div className="space-y-2.5 pt-3.5 border-t border-slate-900/60">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Client Revision Suggestions (Click to Append)
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      {project.revisionNotes.map((note: any) => {
                        const suggestionText = note.requestedChange;
                        if (!suggestionText) return null;
                        return (
                          <button
                            key={note.id}
                            type="button"
                            onClick={() => {
                              const currentVal = promptModifier.trim();
                              if (!currentVal) {
                                setPromptModifier(suggestionText);
                              } else {
                                const terms = currentVal.split(',').map(t => t.trim());
                                if (!terms.includes(suggestionText)) {
                                  setPromptModifier(`${currentVal}, ${suggestionText}`);
                                }
                              }
                            }}
                            className="text-left bg-slate-900/50 hover:bg-indigo-950/20 border border-slate-800 hover:border-indigo-500/30 rounded-lg px-3 py-2 text-[10.5px] font-medium text-slate-300 hover:text-indigo-400 transition-all flex items-center space-x-2 group"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 group-hover:animate-pulse" />
                            <span>{suggestionText}</span>
                            {note.reason && (
                              <span className="text-[9px] text-slate-500">({note.reason})</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

              {/* Step 6: Bypass Cache option */}
              <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4.5 flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-300 block">Bypass Cache & Force Regenerate</label>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">Skip the render cache and queue a fresh GPU render even if an identical result already exists.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForceRegenerate(!forceRegenerate)}
                  className={`relative w-11 h-6 rounded-full border transition-all duration-200 shrink-0 ml-4 ${
                    forceRegenerate
                      ? 'bg-indigo-600 border-indigo-500'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200 ${
                    forceRegenerate
                      ? 'translate-x-5 bg-white'
                      : 'translate-x-0 bg-slate-500'
                  }`} />
                </button>
              </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-850 bg-slate-950/30 mt-auto">
              <button
                onClick={() => setIsLaunchModalOpen(false)}
                className="px-4 py-2.5 rounded-lg text-slate-400 hover:text-slate-100 font-semibold text-xs uppercase tracking-wider transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLaunchRenderConfirm}
                disabled={isLaunchingJob}
                className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-colors uppercase tracking-wider disabled:opacity-60"
              >
                {isLaunchingJob ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Queueing Job...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    <span>Queue Render Job</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Client Share Link Creation Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 text-slate-100">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-800 bg-slate-950/40">
              <div className="flex items-center space-x-2 text-slate-200">
                <Share2 className="h-5 w-5 text-indigo-400" />
                <span className="font-bold text-base font-semibold">Generate Client Share Link</span>
              </div>
              <button 
                onClick={() => setIsShareModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                disabled={isGeneratingShare}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateShareLink} className="p-6 space-y-5">
              {/* Select Renders list with checkboxes */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                  1. Select Renders to Share
                </label>
                <div className="max-h-40 overflow-y-auto border border-slate-850 rounded-lg p-3 bg-slate-950/40 space-y-2">
                  {(project.renders || []).length === 0 ? (
                    <p className="text-slate-500 text-xs italic">No renders outputs available in this project.</p>
                  ) : (
                    (project.renders || []).map((render) => {
                      const isChecked = shareSelectedRenders.includes(render.id);
                      return (
                        <label key={render.id} className="flex items-center space-x-3.5 p-2 rounded hover:bg-slate-900/50 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setShareSelectedRenders(shareSelectedRenders.filter(id => id !== render.id));
                              } else {
                                setShareSelectedRenders([...shareSelectedRenders, render.id]);
                              }
                            }}
                            className="rounded border-slate-800 bg-slate-900 text-indigo-650 focus:ring-0 h-4 w-4 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0 flex items-center justify-between text-xs gap-3">
                            <span className="font-semibold text-slate-300 truncate">Seed: {render.seed}</span>
                            <span className="text-[10px] text-slate-500 uppercase font-mono">{render.style}</span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Password Protection */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  2. Password Protection (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. AcmeClient2026 (Leave blank for open access)"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 text-slate-200 text-xs rounded-lg px-3 py-2.5 focus:border-indigo-500 focus:outline-none placeholder-slate-650 font-medium"
                />
              </div>

              {/* Comments Enabled Switch */}
              <div className="flex items-center justify-between bg-slate-950/30 border border-slate-850 rounded-xl p-4">
                <div>
                  <label className="text-xs font-bold text-slate-350 block">Enable Client Commenting</label>
                  <p className="text-[10px] text-slate-550 mt-0.5">Allow the client to leave comments directly on render variations.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShareCommentsEnabled(!shareCommentsEnabled)}
                  className={`relative w-11 h-6 rounded-full border transition-all duration-200 shrink-0 ml-4 ${
                    shareCommentsEnabled
                      ? 'bg-indigo-650 border-indigo-500'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200 ${
                    shareCommentsEnabled
                      ? 'translate-x-5 bg-white'
                      : 'translate-x-0 bg-slate-500'
                  }`} />
                </button>
              </div>

              {/* Generated link feedback */}
              {generatedShareLink && (
                <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-4 space-y-2">
                  <span className="block text-[10.5px] font-bold text-emerald-400 uppercase tracking-wider">Sharing Link Generated successfully!</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedShareLink}
                      className="flex-1 bg-slate-950 border border-slate-850 rounded px-2.5 py-2 text-[10.5px] text-slate-300 font-mono focus:outline-none select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedShareLink);
                        alert('Link copied to clipboard!');
                      }}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-550 text-white font-bold text-xs rounded transition-colors shrink-0 uppercase tracking-wider"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Close
                </button>
                {!generatedShareLink && (
                  <button
                    type="submit"
                    disabled={isGeneratingShare || shareSelectedRenders.length === 0}
                    className="inline-flex items-center space-x-2 bg-indigo-650 hover:bg-indigo-600 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-colors uppercase tracking-wider disabled:opacity-50"
                  >
                    {isGeneratingShare ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <span>Generate Link</span>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
