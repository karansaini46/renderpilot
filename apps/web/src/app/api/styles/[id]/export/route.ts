import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: styleId } = await params;

    if (!styleId) {
      return NextResponse.json(
        { error: "Missing required parameter 'id'" },
        { status: 400 }
      );
    }

    // 1. Fetch style metadata
    const style = await prisma.style.findUnique({
      where: { id: styleId }
    });

    if (!style) {
      return NextResponse.json(
        { error: `Style with ID '${styleId}' not found.` },
        { status: 404 }
      );
    }

    // 2. Fetch all approved training samples
    const samples = await prisma.trainingSample.findMany({
      where: {
        styleId: styleId,
        approvedForTraining: true
      },
      include: {
        render: {
          select: {
            prompt: true,
            negativePrompt: true,
            project: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    if (samples.length === 0) {
      return NextResponse.json(
        { error: 'No approved training samples found for this style. Please approve samples first.' },
        { status: 400 }
      );
    }

    // 3. Construct ZIP file in memory
    const zip = new JSZip();
    const imagesFolder = zip.folder('images')!;
    const captionsFolder = zip.folder('captions')!;

    const manifestSamples: any[] = [];
    const benchmarkSamples: any[] = [];

    // Download and write image data in parallel
    await Promise.all(
      samples.map(async (sample) => {
        try {
          if (!sample.imageUrl) {
            throw new Error('Image URL is null or empty');
          }

          // Determine file extension
          let extension = 'png';
          const match = sample.imageUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
          if (match) {
            extension = match[1];
          }

          const baseName = `sample_${sample.id}`;
          const imageFilename = `${baseName}.${extension}`;
          const captionFilename = `${baseName}.txt`;

          // Resolve URL
          let imageBuffer: Buffer;
          if (sample.imageUrl.startsWith('http://') || sample.imageUrl.startsWith('https://')) {
            const res = await fetch(sample.imageUrl);
            if (!res.ok) {
              throw new Error(`Fetch failed with status ${res.status}`);
            }
            imageBuffer = Buffer.from(await res.arrayBuffer());
          } else {
            // Treat as relative storage URL
            const publicBase = process.env.STORAGE_PUBLIC_BASE_URL || 'http://localhost:3000';
            const fullUrl = sample.imageUrl.startsWith('/') 
              ? `${publicBase}${sample.imageUrl}` 
              : `${publicBase}/${sample.imageUrl}`;
            
            const res = await fetch(fullUrl);
            if (!res.ok) {
              throw new Error(`Local fetch failed with status ${res.status}`);
            }
            imageBuffer = Buffer.from(await res.arrayBuffer());
          }

          // Add image to ZIP
          imagesFolder.file(imageFilename, imageBuffer);

          // Add caption txt file side-by-side with the image
          const captionText = sample.caption || '';
          imagesFolder.file(captionFilename, captionText);

          // Also save caption in captions folder
          captionsFolder.file(captionFilename, captionText);

          const sampleMeta = {
            id: sample.id,
            imagePath: `images/${imageFilename}`,
            captionPath: `images/${captionFilename}`,
            caption: captionText,
            qualityScore: sample.qualityScore,
            sceneType: sample.sceneType || 'general',
            datasetSplit: sample.datasetSplit || 'train'
          };

          manifestSamples.push(sampleMeta);

          if (sample.datasetSplit === 'validation' || sample.datasetSplit === 'test') {
            benchmarkSamples.push(sampleMeta);
          }
        } catch (err: any) {
          console.error(`[Export Image Download Failed] Sample ID: ${sample.id}:`, err.message);
          
          // Provide 1x1 transparent PNG fallback so packaging does not fail
          const dummyPng = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
            'base64'
          );
          const baseName = `sample_${sample.id}`;
          imagesFolder.file(`${baseName}.png`, dummyPng);
          imagesFolder.file(`${baseName}.txt`, sample.caption || '');
          captionsFolder.file(`${baseName}.txt`, sample.caption || '');

          const sampleMeta = {
            id: sample.id,
            imagePath: `images/${baseName}.png`,
            captionPath: `images/${baseName}.txt`,
            caption: sample.caption || '',
            qualityScore: sample.qualityScore,
            sceneType: sample.sceneType || 'general',
            datasetSplit: sample.datasetSplit || 'train',
            downloadFailed: true
          };

          manifestSamples.push(sampleMeta);
          if (sample.datasetSplit === 'validation' || sample.datasetSplit === 'test') {
            benchmarkSamples.push(sampleMeta);
          }
        }
      })
    );

    // Sort samples for deterministic package layouts
    manifestSamples.sort((a, b) => a.id.localeCompare(b.id));
    benchmarkSamples.sort((a, b) => a.id.localeCompare(b.id));

    // 4. Create metadata.json
    const metadata = {
      styleId: style.id,
      styleName: style.name,
      totalApprovedCount: samples.length,
      exportedAt: new Date().toISOString(),
      samples: manifestSamples
    };
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    // 5. Create recommended_config.json
    const recommendedConfig = {
      model_type: 'sdxl',
      base_model: 'stabilityai/stable-diffusion-xl-base-1.0',
      dataset_config: {
        instance_prompt: `style: ${style.name}`,
        class_prompt: 'architectural render',
        repeats: 10,
        images_dir: 'images/'
      },
      training_parameters: {
        learning_rate: 0.0001,
        batch_size: 1,
        epochs: 15,
        resolution: 1024,
        mixed_precision: 'fp16',
        optimizer: 'AdamW8bit',
        network_dim: 32,
        network_alpha: 16
      }
    };
    zip.file('recommended_config.json', JSON.stringify(recommendedConfig, null, 2));

    // 6. Create benchmarks.json
    const benchmarks = {
      benchmark_samples: benchmarkSamples
    };
    zip.file('benchmarks.json', JSON.stringify(benchmarks, null, 2));

    // 7. Compile ZIP buffer and serve
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const safeStyleName = style.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="style-export-${safeStyleName}.zip"`,
        'Cache-Control': 'no-store'
      }
    });

  } catch (error: any) {
    console.error('[Style Export GET Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error exporting dataset package.' },
      { status: 500 }
    );
  }
}
