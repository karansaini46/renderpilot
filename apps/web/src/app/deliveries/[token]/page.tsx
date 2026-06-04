'use client';

import React, { useState, useEffect, use } from 'react';
import { 
  Lock, 
  Download, 
  MessageSquare, 
  Send, 
  AlertTriangle, 
  Loader2, 
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';

interface Render {
  id: string;
  seed: string | null;
  styleId: string | null;
  createdAt: string;
  finalUrl: string | null;
  previewUrl: string | null;
}

interface DeliveryComment {
  id: string;
  renderId: string | null;
  author: string;
  text: string;
  createdAt: string;
}

interface DeliveryDetails {
  id: string;
  token: string;
  commentsEnabled: boolean;
  createdAt: string;
  projectName: string;
  clientName: string | null;
  renders: Render[];
  comments: DeliveryComment[];
}

interface DeliveryPageProps {
  params: Promise<{ token: string }>;
}

export default function ClientDeliverySpace({ params }: DeliveryPageProps) {
  const { token } = use(params);

  // Core details & loading states
  const [delivery, setDelivery] = useState<DeliveryDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Password gate states
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Gallery viewer states
  const [activeRenderIndex, setActiveRenderIndex] = useState(0);

  // Comment posting states
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentFilter, setCommentFilter] = useState<'all' | 'active'>('all');

  const fetchDeliveryData = async (passwordAttempt?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const passwordQuery = passwordAttempt ? `?password=${encodeURIComponent(passwordAttempt)}` : '';
      const res = await fetch(`/api/deliveries/${token}${passwordQuery}`);

      if (res.ok) {
        const data = await res.json();
        setDelivery(data);
        setPasswordRequired(false);
        setPasswordError(null);
        // Persist password attempt for comments posts
        if (passwordAttempt) {
          sessionStorage.setItem(`delivery_pw_${token}`, passwordAttempt);
        }
      } else if (res.status === 401) {
        const data = await res.json();
        if (data.passwordRequired) {
          setPasswordRequired(true);
          if (passwordAttempt) {
            setPasswordError('Incorrect password. Please try again.');
          }
        } else {
          setError(data.error || 'Access denied.');
        }
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to retrieve delivery information.');
      }
    } catch (err) {
      console.error('Fetch delivery error:', err);
      setError('A connection error occurred while loading this page.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check if password was previously entered and saved in session
    const savedPassword = sessionStorage.getItem(`delivery_pw_${token}`);
    fetchDeliveryData(savedPassword || undefined);
  }, [token]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsAuthenticating(true);
    setPasswordError(null);
    try {
      const res = await fetch(`/api/deliveries/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() })
      });

      if (res.ok) {
        // Fetch again using password
        await fetchDeliveryData(password.trim());
      } else {
        const data = await res.json();
        setPasswordError(data.error || 'Invalid password.');
      }
    } catch (err) {
      console.error('Authentication error:', err);
      setPasswordError('Failed to connect to authentication server.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentAuthor.trim() || !commentText.trim() || !delivery) return;

    setIsSubmittingComment(true);
    try {
      const savedPassword = sessionStorage.getItem(`delivery_pw_${token}`);
      const activeRender = delivery.renders[activeRenderIndex];

      const res = await fetch(`/api/deliveries/${token}/comments`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(savedPassword ? { 'x-delivery-password': savedPassword } : {})
        },
        body: JSON.stringify({
          author: commentAuthor.trim(),
          text: commentText.trim(),
          renderId: commentFilter === 'active' && activeRender ? activeRender.id : undefined
        })
      });

      if (res.ok) {
        const newComment = await res.json();
        // Append new comment to client state
        setDelivery({
          ...delivery,
          comments: [...delivery.comments, newComment]
        });
        setCommentText('');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save comment.');
      }
    } catch (err) {
      console.error('Comment submit error:', err);
      alert('An error occurred while posting your comment.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Helper to trigger direct browser downloads
  const handleDownloadImage = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // Fallback: open in new tab if direct blob download fails
      window.open(url, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
        <span className="text-xs text-slate-400 mt-3 font-semibold tracking-wider uppercase">Loading presentation space...</span>
      </div>
    );
  }

  // Password Gate Interface
  if (passwordRequired) {
    return (
      <div className="min-h-screen bg-slate-955 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6.5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
          
          <div className="text-center space-y-3 mb-6">
            <div className="h-12 w-12 rounded-full bg-indigo-550/10 flex items-center justify-center mx-auto text-indigo-400 border border-indigo-500/20">
              <Lock className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold text-slate-100">Private Delivery Space</h1>
            <p className="text-xs text-slate-500 leading-normal">
              This visualization presentation is password protected. Enter the client key to view the renders.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Access Password"
                required
                disabled={isAuthenticating}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 text-slate-205 text-sm rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 placeholder-slate-650 transition-colors"
              />
            </div>

            {passwordError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11.5px] text-rose-400 flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{passwordError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-sm font-semibold py-3 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-colors disabled:opacity-55"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  <span>Unlocking...</span>
                </>
              ) : (
                <span>Unlock Renders</span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="min-h-screen bg-slate-955 flex items-center justify-center p-4">
        <div className="text-center max-w-sm space-y-4">
          <AlertTriangle className="h-12 w-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-200">Space Unavailable</h2>
          <p className="text-xs text-slate-500 leading-normal">{error || 'This share link has expired or is invalid.'}</p>
        </div>
      </div>
    );
  }

  const activeRender = delivery.renders[activeRenderIndex];

  // Filter comments for active render or all comments
  const filteredComments = delivery.comments.filter(c => {
    if (commentFilter === 'active') {
      return activeRender && c.renderId === activeRender.id;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-955 text-slate-100 flex flex-col">
      {/* Header Panel */}
      <header className="border-b border-slate-900 bg-slate-900/30 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-100 to-indigo-400 bg-clip-text text-transparent truncate">
            {delivery.projectName}
          </h1>
          {delivery.clientName && (
            <p className="text-xs text-slate-450 mt-0.5 font-medium">Prepared for: {delivery.clientName}</p>
          )}
        </div>
        <div className="flex items-center space-x-2 text-[11px] text-slate-500 bg-slate-950/60 px-3.5 py-1.5 rounded-lg border border-slate-900/50 w-fit shrink-0">
          <Clock className="h-3.5 w-3.5" />
          <span>Shared on {new Date(delivery.createdAt).toLocaleDateString()}</span>
        </div>
      </header>

      {/* Main Layout Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden">
        {/* Large Left Component: Render Preview Gallery & thumbnails */}
        <div className="lg:col-span-2 p-6 flex flex-col justify-between space-y-6 border-r border-slate-900">
          
          {delivery.renders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-950/40 border border-slate-900 rounded-2xl aspect-video">
              <ImageIcon className="h-10 w-10 text-slate-700 mb-2" />
              <p className="text-slate-550 text-xs italic">No renders included in this space.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center space-y-4">
              {/* Active Image Canvas */}
              <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-900 bg-slate-950 flex items-center justify-center group shadow-xl">
                {activeRender ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={activeRender.finalUrl || activeRender.previewUrl || ''} 
                      alt={`Render visual variation`} 
                      className="object-contain w-full h-full max-h-[60vh] select-none"
                    />

                    {/* Pre-signed export button */}
                    <button
                      onClick={() => handleDownloadImage(
                        activeRender.finalUrl || activeRender.previewUrl || '',
                        `${delivery.projectName.toLowerCase().replace(/\s+/g, '_')}_variation_${activeRenderIndex + 1}.png`
                      )}
                      className="absolute bottom-4 right-4 bg-slate-950/90 hover:bg-indigo-650 text-slate-200 hover:text-white px-4 py-2.5 rounded-xl border border-slate-850 hover:border-indigo-500 text-xs font-bold transition-all duration-200 flex items-center space-x-2 shadow-lg backdrop-blur-sm"
                      title="Download full resolution image"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download High-Res</span>
                    </button>
                    
                    {/* Visual indicators */}
                    <span className="absolute top-4 left-4 px-2.5 py-1 bg-slate-950/80 rounded-lg text-[9px] font-bold text-slate-400 uppercase tracking-widest border border-slate-900/60 backdrop-blur-sm">
                      Variation {activeRenderIndex + 1} of {delivery.renders.length}
                    </span>
                  </>
                ) : null}

                {/* Left/Right Slideshow Controls */}
                {delivery.renders.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveRenderIndex(prev => (prev === 0 ? delivery.renders.length - 1 : prev - 1))}
                      className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-slate-950/70 hover:bg-slate-955 text-slate-350 hover:text-slate-100 border border-slate-900/60 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md backdrop-blur-sm"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setActiveRenderIndex(prev => (prev === delivery.renders.length - 1 ? 0 : prev + 1))}
                      className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-slate-950/70 hover:bg-slate-955 text-slate-350 hover:text-slate-100 border border-slate-900/60 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md backdrop-blur-sm"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnails list track */}
              {delivery.renders.length > 1 && (
                <div className="flex items-center space-x-3 overflow-x-auto py-2.5 scrollbar-thin">
                  {delivery.renders.map((r, idx) => {
                    const isActive = activeRenderIndex === idx;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setActiveRenderIndex(idx)}
                        className={`relative aspect-video w-24 rounded-lg overflow-hidden border transition-all shrink-0 bg-slate-950 ${
                          isActive 
                            ? 'border-indigo-500 shadow-md shadow-indigo-500/10 scale-102' 
                            : 'border-slate-900 hover:border-slate-800'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={r.previewUrl || r.finalUrl || ''} 
                          alt="Thumbnail preview" 
                          className="object-cover w-full h-full"
                        />
                        <div className="absolute inset-0 bg-black/20" />
                        <span className="absolute bottom-1 right-1.5 text-[8px] font-bold text-slate-300">#{idx + 1}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Panel: Client Feedback Comments */}
        <div className="p-6 flex flex-col justify-between space-y-6 h-[calc(100vh-80px)] overflow-y-auto bg-slate-950/30">
          <div className="space-y-5 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="flex items-center space-x-2 text-slate-205">
                <MessageSquare className="h-4.5 w-4.5 text-indigo-400" />
                <h3 className="font-bold text-sm">Client Feedback Board</h3>
              </div>
              {delivery.commentsEnabled && delivery.renders.length > 1 && (
                <div className="flex items-center space-x-1.5 bg-slate-950/80 border border-slate-900 rounded-lg p-0.5">
                  <button
                    onClick={() => setCommentFilter('all')}
                    className={`px-2.5 py-1 text-[9px] font-bold rounded uppercase tracking-wider transition-all ${
                      commentFilter === 'all' 
                        ? 'bg-slate-900 text-indigo-400 border border-slate-850' 
                        : 'text-slate-450 hover:text-slate-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setCommentFilter('active')}
                    className={`px-2.5 py-1 text-[9px] font-bold rounded uppercase tracking-wider transition-all ${
                      commentFilter === 'active' 
                        ? 'bg-slate-900 text-indigo-400 border border-slate-850' 
                        : 'text-slate-450 hover:text-slate-200'
                    }`}
                  >
                    Active
                  </button>
                </div>
              )}
            </div>

            {/* List of comments */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
              {filteredComments.length === 0 ? (
                <div className="text-center py-12 text-slate-550 space-y-2">
                  <p className="text-xs italic">No comments left yet.</p>
                  {delivery.commentsEnabled && (
                    <p className="text-[10px] text-slate-600 max-w-xs mx-auto leading-normal">
                      Share your thoughts! Fill out the feedback card below to submit adjustments directly.
                    </p>
                  )}
                </div>
              ) : (
                filteredComments.map((c) => {
                  const renderIdx = delivery.renders.findIndex(r => r.id === c.renderId);
                  return (
                    <div key={c.id} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-900/60 space-y-2 relative group hover:border-slate-850 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="h-5 w-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                            <User className="h-3 w-3" />
                          </div>
                          <span className="text-xs font-bold text-slate-250 truncate max-w-[120px]">{c.author}</span>
                        </div>
                        <span className="text-[9px] text-slate-550">{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <p className="text-[11.5px] text-slate-350 leading-relaxed font-medium">
                        {c.text}
                      </p>

                      {renderIdx !== -1 && (
                        <div className="pt-2 border-t border-slate-900/40 flex items-center justify-between">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-indigo-400/90 font-bold uppercase border border-slate-850">
                            Variation {renderIdx + 1}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Form to submit a comment (only if enabled) */}
          {delivery.commentsEnabled ? (
            <form onSubmit={handlePostComment} className="pt-4 border-t border-slate-900 space-y-3 bg-slate-955">
              <div className="grid grid-cols-1 gap-2.5">
                <input
                  type="text"
                  placeholder="Your Name"
                  required
                  disabled={isSubmittingComment}
                  value={commentAuthor}
                  onChange={(e) => setCommentAuthor(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 text-slate-205 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-slate-650 font-medium"
                />
                
                <div className="relative">
                  <textarea
                    placeholder={
                      commentFilter === 'active' && activeRender
                        ? `Add comment to Render #${activeRenderIndex + 1}...`
                        : "Add a general feedback comment..."
                    }
                    rows={3}
                    required
                    disabled={isSubmittingComment}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 text-slate-205 text-xs rounded-lg p-3 pr-10 focus:outline-none focus:border-indigo-500 placeholder-slate-655 font-medium leading-relaxed resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingComment || !commentText.trim()}
                    className="absolute bottom-2.5 right-2.5 p-1.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg transition-colors shadow disabled:opacity-50 disabled:bg-slate-900"
                  >
                    {isSubmittingComment ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="p-3 bg-slate-950/20 border border-slate-900/60 rounded-xl text-center">
              <p className="text-[10px] text-slate-550 leading-relaxed font-semibold uppercase tracking-wider">Comments Disabled</p>
              <p className="text-[9px] text-slate-600 mt-0.5">The presentation creator has locked commenting for this share space.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
