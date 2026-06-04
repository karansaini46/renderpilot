import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        projectFiles: {
          orderBy: { createdAt: 'desc' },
        },
        renders: {
          orderBy: { createdAt: 'desc' },
          include: {
            feedback: true,
          },
        },
        renderJobs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Load revision notes associated with this project OR with the project's clientName
    const clientName = project.clientName;
    const revisionNotes = await prisma.revisionNote.findMany({
      where: {
        OR: [
          { projectId: id },
          clientName && clientName.trim() !== '' ? { clientName } : undefined
        ].filter(Boolean) as any
      },
      orderBy: { createdAt: 'desc' }
    });

    const responsePayload = {
      ...project,
      revisionNotes
    };

    const jsonString = JSON.stringify(responsePayload, (key, val) => 
      typeof val === 'bigint' ? val.toString() : val
    );

    return new Response(jsonString, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Project ID GET API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching project details' },
      { status: 500 }
    );
  }
}
