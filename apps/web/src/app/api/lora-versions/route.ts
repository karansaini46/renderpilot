import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET: Lists all model versions and styles.
 * Returns: { versions: LoraVersion[], styles: { id, name }[] }
 */
export async function GET(request: Request) {
  try {
    const [versions, styles] = await Promise.all([
      prisma.loraVersion.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          style: {
            select: { name: true }
          }
        }
      }),
      prisma.style.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true
        }
      })
    ]);

    return NextResponse.json({ versions, styles }, { status: 200 });
  } catch (error: any) {
    console.error('[Lora Versions GET Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error fetching model versions' },
      { status: 500 }
    );
  }
}

/**
 * POST: Handles create, activate, deactivate, and delete actions for version records.
 */
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

    const { 
      action, 
      id, 
      styleId, 
      versionName, 
      version, 
      fileUrl, 
      datasetSize, 
      benchmarkScore, 
      geometryScore,
      styleScore,
      realismScore,
      materialScore,
      overallScore,
      passed,
      status, 
      notes 
    } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing required parameter 'action'" },
        { status: 400 }
      );
    }

    // 1. Create action
    if (action === 'create') {
      if (!styleId || !versionName || !fileUrl) {
        return NextResponse.json(
          { error: "Missing required fields 'styleId', 'versionName', or 'fileUrl'" },
          { status: 400 }
        );
      }

      // Verify style exists
      const style = await prisma.style.findUnique({
        where: { id: styleId }
      });

      if (!style) {
        return NextResponse.json(
          { error: `Style with ID '${styleId}' not found.` },
          { status: 404 }
        );
      }

      const newId = `lv_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const computedOverall = overallScore !== undefined && overallScore !== null 
        ? Number(overallScore) 
        : benchmarkScore !== undefined && benchmarkScore !== null 
        ? Number(benchmarkScore) 
        : null;

      const newVersion = await prisma.loraVersion.create({
        data: {
          id: newId,
          styleId,
          versionName,
          version: version || '1.0.0',
          fileUrl,
          datasetSize: datasetSize !== undefined && datasetSize !== null ? Number(datasetSize) : null,
          benchmarkScore: computedOverall,
          geometryScore: geometryScore !== undefined && geometryScore !== null ? Number(geometryScore) : null,
          styleScore: styleScore !== undefined && styleScore !== null ? Number(styleScore) : null,
          realismScore: realismScore !== undefined && realismScore !== null ? Number(realismScore) : null,
          materialScore: materialScore !== undefined && materialScore !== null ? Number(materialScore) : null,
          overallScore: computedOverall,
          passed: passed !== undefined ? !!passed : false,
          status: status || 'ready',
          active: false, // New versions default to inactive
          notes: notes || '',
        },
        include: {
          style: {
            select: { name: true }
          }
        }
      });

      return NextResponse.json(newVersion, { status: 201 });
    }

    // For other actions, 'id' is required
    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter 'id'" },
        { status: 400 }
      );
    }

    // Verify version record exists
    const existingVersion = await prisma.loraVersion.findUnique({
      where: { id }
    });

    if (!existingVersion) {
      return NextResponse.json(
        { error: 'Model version record not found' },
        { status: 404 }
      );
    }

    // 2. Activate action
    if (action === 'activate') {
      // Enforce only one active version per style using a transaction
      const targetStyleId = existingVersion.styleId;

      await prisma.$transaction([
        // Deactivate all versions for this style
        prisma.loraVersion.updateMany({
          where: { styleId: targetStyleId },
          data: { active: false }
        }),
        // Activate this specific version
        prisma.loraVersion.update({
          where: { id },
          data: { active: true }
        })
      ]);

      const updated = await prisma.loraVersion.findUnique({
        where: { id },
        include: {
          style: {
            select: { name: true }
          }
        }
      });

      return NextResponse.json(updated, { status: 200 });
    }

    // 3. Deactivate action
    if (action === 'deactivate') {
      const updated = await prisma.loraVersion.update({
        where: { id },
        data: { active: false },
        include: {
          style: {
            select: { name: true }
          }
        }
      });

      return NextResponse.json(updated, { status: 200 });
    }

    // 4. Delete action
    if (action === 'delete') {
      await prisma.loraVersion.delete({
        where: { id }
      });

      return NextResponse.json(
        { success: true, message: 'Model version excluded successfully.' },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: `Unsupported action '${action}'` },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('[Lora Versions POST Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error processing model version' },
      { status: 500 }
    );
  }
}
