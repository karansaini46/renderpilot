'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  FolderKanban, 
  ListTodo, 
  Settings as SettingsIcon, 
  Menu, 
  X, 
  Cpu, 
  Layers,
  Database
} from 'lucide-react';

interface Worker {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  lastSeenAt: string | null;
  lastHeartbeat: string | null;
}

interface SidebarProps {
  workerStatus?: 'online' | 'offline' | 'busy';
  workerName?: string;
}

export default function Sidebar({ workerStatus: initialStatus = 'offline', workerName: initialName = 'No active workers' }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<'online' | 'offline' | 'busy'>(initialStatus);
  const [workerName, setWorkerName] = useState<string>(initialName);

  const menuItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: FolderKanban },
    { name: 'Jobs Queue', href: '/jobs', icon: ListTodo },
    { name: 'Workers', href: '/workers', icon: Cpu },
    { name: 'Dataset', href: '/dataset', icon: Database },
    { name: 'Model Registry', href: '/models', icon: Layers },
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  const fetchWorkerStatus = async () => {
    try {
      const res = await fetch('/api/workers');
      if (res.ok) {
        const workers: Worker[] = await res.json();
        
        // Find active workers (online or busy)
        const activeWorkers = workers.filter(w => w.status === 'online' || w.status === 'busy');
        
        if (activeWorkers.length > 0) {
          const isBusy = activeWorkers.some(w => w.status === 'busy');
          setWorkerStatus(isBusy ? 'busy' : 'online');
          setWorkerName(activeWorkers[0].name);
        } else {
          setWorkerStatus('offline');
          setWorkerName(workers.length > 0 ? workers[0].name : 'No active workers');
        }
      }
    } catch (err) {
      console.error('Failed to fetch worker status telemetry:', err);
    }
  };

  useEffect(() => {
    fetchWorkerStatus();
    
    // Poll worker status telemetry every 4 seconds
    const interval = setInterval(fetchWorkerStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
      case 'busy': return 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]';
      default: return 'bg-slate-600';
    }
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="lg:hidden flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 text-slate-100 z-40 relative">
        <div className="flex items-center space-x-2">
          <Layers className="h-6 w-6 text-indigo-400" />
          <span className="font-bold text-lg tracking-wider bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent">
            RenderPilot
          </span>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-slate-100"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Navigation Sidebar Panel */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-950/80 backdrop-blur-xl border-r border-slate-900/60
        flex flex-col transform transition-transform duration-300 lg:translate-x-0 lg:static lg:h-screen lg:z-30
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo Branding */}
        <div className="hidden lg:flex items-center space-x-3 px-6 py-8 border-b border-slate-900/50">
          <Layers className="h-7 w-7 text-indigo-400 animate-pulse" />
          <span className="font-extrabold text-xl tracking-wider bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent">
            RenderPilot
          </span>
        </div>

        {/* Menu Items Link Lists */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`
                  flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group
                  ${isActive 
                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' 
                    : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200 border border-transparent'}
                `}
              >
                <Icon className={`h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Local Laptop Worker Node Telemetry status indicator */}
        <div className="p-4 border-t border-slate-900/50 bg-slate-950/40">
          <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-900/40 border border-slate-900/60">
            <div className="p-2 rounded bg-slate-950">
              <Cpu className={`h-5 w-5 ${workerStatus === 'offline' ? 'text-slate-500' : 'text-indigo-400 animate-pulse'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-300 truncate">{workerName}</p>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className={`h-1.5 w-1.5 rounded-full ${getStatusColor(workerStatus)}`} />
                <span className="text-[10px] text-slate-400 capitalize font-medium">{workerStatus}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
