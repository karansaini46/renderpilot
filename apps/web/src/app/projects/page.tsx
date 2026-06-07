'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Folder, 
  Search, 
  Plus, 
  X, 
  Image as ImageIcon, 
  Clock, 
  ChevronRight,
  Loader2
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  projectType: string;
  sceneType: string;
  stylePreference: string;
  notes: string;
  status: string;
  updatedAt: string;
  _count?: {
    projectFiles: number;
  };
}

function ProjectsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Modal form states
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectType, setProjectType] = useState('Residential');
  const [sceneType, setSceneType] = useState('Exterior');
  const [stylePreference, setStylePreference] = useState('Modern Luxury Exterior');
  const [notes, setNotes] = useState('');

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (searchParams?.get('new') === 'true') {
      setIsModalOpen(true);
    }
  }, [searchParams]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName.trim(),
          projectType,
          sceneType,
          stylePreference,
          notes: notes.trim(),
          clientName: clientName.trim(),
        }),
      });

      if (res.ok) {
        const newProject = await res.json();
        // Reset form
        setProjectName('');
        setClientName('');
        setProjectType('Residential');
        setSceneType('Exterior');
        setStylePreference('Modern Luxury Exterior');
        setNotes('');
        setIsModalOpen(false);
        // Redirect to new project details page where user can upload image/model files
        router.push(`/projects/${newProject.id}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.projectType && p.projectType.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.stylePreference && p.stylePreference.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-400 bg-clip-text text-transparent">
            Projects Registry
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Access and organize your architectural visualization spaces.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-sm font-semibold px-4.5 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/20 transform transition-all duration-200 active:scale-95 w-fit"
        >
          <Plus className="h-4.5 w-4.5" />
          <span>New Project</span>
        </button>
      </div>

      {/* Filters Search Bar */}
      <div className="relative">
        <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
        <input 
          type="text" 
          placeholder="Filter projects by name, type, or style..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-900/30 border border-slate-900 hover:border-slate-800 focus:border-indigo-500/50 focus:outline-none rounded-xl pl-12 pr-6 py-3.5 text-sm text-slate-200 placeholder-slate-500 transition-all"
        />
      </div>

      {/* Loader indicator */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
          <span className="text-xs text-slate-450 mt-3">Loading projects from database...</span>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-slate-900/10 border border-dashed border-slate-900 rounded-2xl py-20 px-6 text-center max-w-lg mx-auto">
          <Folder className="h-12 w-12 text-slate-600 mx-auto" />
          <h3 className="text-slate-300 font-bold text-lg mt-4">No projects found</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
            Try adjusting your search criteria or create a brand new architectural layout space to start rendering.
          </p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="mt-6 bg-slate-900 hover:bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-semibold px-4 py-2 border border-slate-800 hover:border-slate-700 rounded-lg transition-all"
          >
            Create First Project
          </button>
        </div>
      ) : (
        /* Projects Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Link 
              key={project.id}
              href={`/projects/${project.id}`}
              className="bg-slate-900/40 border border-slate-900 hover:border-slate-850 rounded-xl overflow-hidden hover:bg-slate-900/60 transition-all duration-300 flex flex-col group hover:-translate-y-0.5"
            >
              {/* Card visual cap */}
              <div className="h-2 bg-gradient-to-r from-indigo-500/80 to-indigo-600/60" />
              
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-bold text-slate-200 group-hover:text-indigo-400 transition-colors truncate max-w-[200px]">
                      {project.name}
                    </h3>
                    <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-slate-300 transition-colors" />
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-900 text-slate-400">
                      {project.projectType}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-900 text-slate-450">
                      {project.sceneType}
                    </span>
                  </div>
                  <p className="text-xs text-indigo-400/90 font-medium mt-3">Style: {project.stylePreference}</p>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 mt-6 pt-4 border-t border-slate-900/60">
                  <div className="flex items-center space-x-1.5">
                    <ImageIcon className="h-4 w-4 text-slate-500" />
                    <span>View files</span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-slate-500">
                    <Clock className="h-4 w-4" />
                    <span>{new Date(project.updatedAt || Date.now()).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Creation Project Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-900 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl relative">
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-900">
              <div className="flex items-center space-x-2 text-slate-200">
                <Folder className="h-5 w-5 text-indigo-400" />
                <span className="font-bold text-base">Create New Project</span>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                disabled={isSubmitting}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                  Project Title
                </label>
                <input 
                  type="text" 
                  required
                  disabled={isSubmitting}
                  placeholder="e.g. Modern Cliffside Exterior"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">
                  Client Name (Optional)
                </label>
                <input 
                  type="text" 
                  disabled={isSubmitting}
                  placeholder="e.g. Acme Corporation or John Doe"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-455 uppercase tracking-wider mb-1.5">
                    Project Type
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-xs text-slate-200 transition-all"
                  >
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Interior Design">Interior Design</option>
                    <option value="Landscape">Landscape</option>
                    <option value="Conceptual">Conceptual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-455 uppercase tracking-wider mb-1.5">
                    Scene Type
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={sceneType}
                    onChange={(e) => setSceneType(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-xs text-slate-200 transition-all"
                  >
                    <option value="Exterior">Exterior</option>
                    <option value="Interior">Interior</option>
                    <option value="Aerial Studio">Aerial Studio</option>
                    <option value="Macro Detail">Macro Detail</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-455 uppercase tracking-wider mb-1.5">
                  Default Style Preference
                </label>
                <select
                  disabled={isSubmitting}
                  value={stylePreference}
                  onChange={(e) => setStylePreference(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-xs text-slate-200 transition-all"
                >
                  <option value="Modern Luxury Exterior">Modern Luxury Exterior</option>
                  <option value="Warm Interior">Warm Interior</option>
                  <option value="Minimal White">Minimal White</option>
                  <option value="Tropical Villa">Tropical Villa</option>
                  <option value="Night Exterior">Night Exterior</option>
                  <option value="Brutalist Moody">Brutalist Moody</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-455 uppercase tracking-wider mb-1.5">
                  Design Notes / Directives
                </label>
                <textarea
                  disabled={isSubmitting}
                  rows={3}
                  placeholder="Describe material mappings, environment lighting directives, or context details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-900 focus:border-indigo-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 transition-all resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-900">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-sm font-semibold px-4.5 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Project</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Projects() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400 text-sm font-medium animate-pulse">Loading projects registry...</div>
      </div>
    }>
      <ProjectsList />
    </Suspense>
  );
}
