import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RenderPilot - Local Architectural Visualization Control Center",
  description: "Offline, local-first rendering orchestration engine optimized for 4GB VRAM GPU architectural visualization.",
  keywords: ["architectural visualization", "blender rendering", "stable diffusion", "local-first", "RTX 3050"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-950 text-slate-100 selection:bg-brand-500/30 selection:text-brand-300">
        {children}
      </body>
    </html>
  );
}
