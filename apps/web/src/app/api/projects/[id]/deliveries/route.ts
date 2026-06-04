import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * GET: Lists all deliveries generated for a project.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const deliveries = await prisma.delivery.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(deliveries, { status: 200 });
  } catch (error: any) {
    console.error('[Deliveries GET API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error listing project deliveries' },
      { status: 500 }
    );
  }
}

/**
 * POST: Creates a new client delivery sharing link.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { password, commentsEnabled, renderIds } = body;

    if (!renderIds || !Array.isArray(renderIds) || renderIds.length === 0) {
      return NextResponse.json(
        { error: 'renderIds is required and must be a non-empty array of render IDs' },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Generate secure unique token
    const token = crypto.randomBytes(12).toString('hex');
    const deliveryId = `delivery_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const delivery = await prisma.delivery.create({
      data: {
        id: deliveryId,
        projectId,
        token,
        password: password ? password.trim() : null,
        commentsEnabled: commentsEnabled !== undefined ? !!commentsEnabled : true,
        rendersJson: JSON.stringify(renderIds)
      }
    });

    return NextResponse.json(delivery, { status: 201 });
  } catch (error: any) {
    console.error('[Delivery POST API Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error generating delivery space' },
      { status: 500 }
    );
  }
}
