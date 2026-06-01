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

    return NextResponse.json(project, { status: 200 });

  } catch (error: any) {
    console.error('[Project ID GET API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching project details' },
      { status: 500 }
    );
  }
}
