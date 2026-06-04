import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
    
    return NextResponse.json(projects, { status: 200 });
  } catch (error: any) {
    console.error('[Projects GET API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { name, projectType, sceneType, stylePreference, notes, clientName } = body;

    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    const projectId = `proj_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const newProject = await prisma.project.create({
      data: {
        id: projectId,
        name: name.trim(),
        projectType: projectType || 'Modern Luxury Exterior',
        sceneType: sceneType || 'Exterior',
        stylePreference: stylePreference || 'Modern Luxury Exterior',
        notes: notes || '',
        clientName: clientName || null,
        status: 'active',
      },
    });

    return NextResponse.json(newProject, { status: 201 });

  } catch (error: any) {
    console.error('[Projects POST API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error creating project' },
      { status: 500 }
    );
  }
}
