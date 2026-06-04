import { prisma } from '../db';
import { PromptBrainSchema, VALID_MATERIAL_CATEGORIES } from './types';

/**
 * Processes PromptBrain suggestions and texture analysis, creating or updating
 * MaterialMapping rows in the database.
 * 
 * Rules:
 * - Only category/zone in VALID_MATERIAL_CATEGORIES is processed.
 * - If confidence >= 0.80, mapping is auto-locked (locked: true).
 * - If confidence 0.50-0.79, mapping is saved as suggested but not locked (locked: false).
 * - If confidence < 0.50, mapping is skipped (relying on promptBrainAnalysis JSON instead).
 * - correction_source is set to 'gemini' for Gemini-sourced suggestions.
 * - reason contains the explanation of source, confidence, and texture context.
 * - Existing user-locked mappings (or any mapping with locked: true) are not overwritten.
 */
export async function processAutoMaterialMappings(
  projectId: string,
  analysis: PromptBrainSchema
): Promise<void> {
  if (!analysis || !analysis.material_mappings) {
    return;
  }

  // Fetch all existing mappings for this project to check for user locks
  const existingMappings = await prisma.materialMapping.findMany({
    where: { projectId }
  });

  const textureAnalysis = analysis.texture_analysis;
  const patternsText = textureAnalysis?.dominantPatterns?.length
    ? ` (patterns: ${textureAnalysis.dominantPatterns.join(', ')})`
    : '';
  const textureSummary = `${textureAnalysis?.description || 'standard'}${patternsText}`;

  for (let i = 0; i < analysis.material_mappings.length; i++) {
    const suggestion = analysis.material_mappings[i];
    const category = (suggestion.category || '').toLowerCase().trim();

    // 1. Validate zone/category
    if (!VALID_MATERIAL_CATEGORIES.includes(category as any)) {
      continue;
    }

    // 2. Enforce confidence thresholds
    const confidence = suggestion.confidence ?? 0;
    if (confidence < 0.50) {
      continue;
    }

    const isLocked = confidence >= 0.80;

    // 3. Find if there are existing mappings for the same category
    const existingOfSameCategory = existingMappings.filter(
      m => m.detectedClass.toLowerCase() === category
    );

    // 4. Do not overwrite user-locked mappings (any existing locked mapping wins)
    const hasUserLocked = existingOfSameCategory.some(
      m => m.locked || m.correctionSource === 'user'
    );

    if (hasUserLocked) {
      continue;
    }

    const reasonText = `Auto-detected via Gemini analysis with ${(confidence * 100).toFixed(0)}% confidence. Texture context: ${textureSummary}`;

    if (existingOfSameCategory.length > 0) {
      // Update the first existing mapping of this category
      const targetMapping = existingOfSameCategory[0];
      await prisma.materialMapping.update({
        where: { id: targetMapping.id },
        data: {
          objectName: suggestion.objectName || suggestion.category,
          selectedMaterial: suggestion.suggestedMaterial,
          confidence: confidence,
          locked: isLocked,
          correctionSource: 'gemini',
          reason: reasonText
        }
      });

      // Keep only one mapping per category by removing any other extra unlocked ones
      if (existingOfSameCategory.length > 1) {
        const idsToDelete = existingOfSameCategory.slice(1).map(m => m.id);
        await prisma.materialMapping.deleteMany({
          where: { id: { in: idsToDelete } }
        });
      }
    } else {
      // Create new mapping
      await prisma.materialMapping.create({
        data: {
          id: `mm_${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`,
          projectId,
          objectName: suggestion.objectName || suggestion.category,
          detectedClass: category,
          selectedMaterial: suggestion.suggestedMaterial,
          confidence: confidence,
          locked: isLocked,
          correctionSource: 'gemini',
          reason: reasonText
        }
      });
    }
  }
}
