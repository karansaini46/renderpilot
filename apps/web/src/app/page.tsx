import React from 'react';
import Link from 'next/link';
import { prisma } from '../lib/db';
import { 
  Play, 
  CheckCircle2, 
  Folder, 
  Clock, 
  Plus, 
  ArrowUpRight,
  ListTodo,
  LucideIcon
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  // Direct server-side Neon database queries
  const projectsCount = await prisma.project.count();
  const jobsCount = await prisma.renderJob.count();
  
  const completedJobsCount = await prisma.renderJob.count({
    where: { status: 'completed' }
  });

  const activeJobs = await prisma.renderJob.findMany({
    where: {
      status: { in: ['queued', 'claimed', 'processing'] }
    },
    include: {
      project: true
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  const recentProjects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3
  });

  // Calculate stats values with explicit types
  const stats: { name: string; value: string; icon: LucideIcon; color: string; bg: string }[] = [
    { name: 'Active Render Jobs', value: activeJobs.length.toString(), icon: Play, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { name: 'Completed Renders', value: completedJobsCount.toString(), icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { name: 'Total Jobs Logged', value: jobsCount.toString(), icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { name: 'Active Projects', value: projectsCount.toString(), icon: Folder, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  ];

  return (
    <div className="space-y-10">
      {/* Top Banner section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-400 bg-clip-text text-transparent">
            System Console
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Monitor rendering jobs and manage architectural assets on your local workstation.
          </p>
        </div>
        <Link 
          href="/projects?new=true" 
          className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-sm font-semibold px-4.5 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/20 transform transition-all duration-200 active:scale-95 w-fit"
        >
          <Plus className="h-4.5 w-4.5" />
          <span>New Project</span>
        </Link>
      </div>

      {/* Statistics Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div 
              key={stat.name} 
              className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 transition-all duration-300 group hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.name}</span>
                <div className={`p-2 rounded-lg ${stat.bg} ${stat.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-100 mt-4 tracking-tight">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Render Queue Panel */}
        <div className="lg:col-span-2 bg-slate-900/30 border border-slate-900 rounded-xl p-6 flex flex-col">
          <div className="flex items-center justify-between pb-5 border-b border-slate-900">
            <div>
              <h2 className="text-lg font-bold text-slate-200">Active Render Queue</h2>
              <p className="text-xs text-slate-400 mt-0.5">Live visualization queue claimed by local workers.</p>
            </div>
            <Link href="/jobs" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1">
              <span>View All Queue</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 space-y-4 flex-1">
            {activeJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ListTodo className="h-8 w-8 text-slate-650 mb-2" />
                <span className="text-xs text-slate-500">No active rendering jobs currently in progress.</span>
              </div>
            ) : (
              activeJobs.map((job: any) => (
                <div key={job.id} className="p-4 rounded-lg bg-slate-900/40 border border-slate-900/60 hover:border-slate-800/80 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">{job.project?.name || 'Unknown Project'}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5 uppercase tracking-wide">ID: {job.id}</p>
                    </div>
                    <div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 uppercase tracking-wider animate-pulse border border-indigo-500/20">
                        {job.status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-450">
                    <span>Progress:</span>
                    <span className="font-bold text-indigo-400">{job.progress}%</span>
                  </div>
                  
                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-2 border border-slate-900">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Projects Side Panel */}
        <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-6 flex flex-col">
          <div className="flex items-center justify-between pb-5 border-b border-slate-900">
            <div>
              <h2 className="text-lg font-bold text-slate-200">Recent Projects</h2>
              <p className="text-xs text-slate-400 mt-0.5">Quick access to visual layouts.</p>
            </div>
            <Link href="/projects" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1">
              <span>See All</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 space-y-4 flex-1">
            {recentProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Folder className="h-8 w-8 text-slate-650 mb-2" />
                <span className="text-xs text-slate-500">No projects created yet.</span>
              </div>
            ) : (
              recentProjects.map((project: any) => (
                <Link 
                  key={project.id} 
                  href={`/projects/${project.id}`}
                  className="block p-4 rounded-lg bg-slate-900/40 border border-slate-900/60 hover:border-slate-800 transition-all hover:bg-slate-900/60 group"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors truncate max-w-[160px]">
                      {project.name}
                    </h3>
                    <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mt-3">
                    <span>{project.stylePreference}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Updated: {project.updatedAt.toLocaleDateString()}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
