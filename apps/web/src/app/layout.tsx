import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'RenderPilot Console',
  description: 'Architectural visualization pipeline dashboard controller',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Load Inter font from Google Fonts */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-slate-950 text-slate-100 flex flex-col lg:flex-row min-h-screen">
        <Sidebar workerStatus="online" workerName="Laptop Workstation 01" />
        <main className="flex-1 overflow-y-auto px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </body>
    </html>
  );
}
