import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET: Retrieves all manual material mappings registered for a project.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const mappings = await prisma.materialMapping.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    });

    return NextResponse.json(mappings, { status: 200 });
  } catch (error: any) {
    console.error('[Materials GET Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching material mappings' },
      { status: 500 }
    );
  }
}

/**
 * POST: Handles saving (creating/updating) or deleting material mapping definitions.
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

    const { id, objectName, detectedClass, selectedMaterial, locked, action } = body;

    // Delete flow
    if (action === 'delete') {
      if (!id) {
        return NextResponse.json(
          { error: "Missing required parameter 'id' for deletion" },
          { status: 400 }
        );
      }

      await prisma.materialMapping.delete({
        where: { id }
      });

      return NextResponse.json(
        { success: true, message: 'Material mapping deleted successfully' },
        { status: 200 }
      );
    }

    // Upsert validation rules
    if (!detectedClass || !selectedMaterial) {
      return NextResponse.json(
        { error: 'Both material category (class) and desired finish are required' },
        { status: 400 }
      );
    }

    const validCategories = [
      'wall', 'floor', 'ceiling', 'glass', 'frame', 'wood', 
      'stone', 'concrete', 'metal', 'vegetation', 'furniture', 'sky'
    ];

    if (!validCategories.includes(detectedClass.toLowerCase().trim())) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    const targetId = id || `mm_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const mapping = await prisma.materialMapping.upsert({
      where: { id: targetId },
      update: {
        objectName: objectName || detectedClass,
        detectedClass: detectedClass.toLowerCase().trim(),
        selectedMaterial: selectedMaterial.trim(),
        locked: !!locked,
        confidence: 1.0,
        correctionSource: 'user'
      },
      create: {
        id: targetId,
        projectId,
        objectName: objectName || detectedClass,
        detectedClass: detectedClass.toLowerCase().trim(),
        selectedMaterial: selectedMaterial.trim(),
        locked: !!locked,
        confidence: 1.0,
        correctionSource: 'user'
      }
    });

    return NextResponse.json(mapping, { status: 200 });

  } catch (error: any) {
    console.error('[Materials POST Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error saving material mapping' },
      { status: 500 }
    );
  }
}
