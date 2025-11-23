import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { MeasurementUnit } from '../products/entities/measurement-unit.enum';
import { Category } from '../categories/entities/category.entity';
import { normalizeUnit } from './unit-synonyms.map';

export interface RawItemInput {
  name: string;
  quantity: number;
  measurementUnit: string;
  sourceText: string;
}

export interface ValidatedItem {
  name: string; // Nombre normalizado (singular, chileno, básico)
  quantity: number; // Cantidad verificada y convertida
  measurementUnit: MeasurementUnit; // Unidad normalizada según BD
  sourceText: string; // Texto original
  confidence: 'high' | 'medium' | 'low'; // Confianza en la validación
  conversionNote?: string; // Nota si hubo conversión de unidades
}

interface UnitValidationResult {
  unit: MeasurementUnit;
  quantity: number; // Cantidad convertida si fue necesario
  conversionNote?: string;
}

export interface ProcessedBatchItem extends ValidatedItem {
  categoryName: string;
  categoryEmoji: string;
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly anthropic: Anthropic;

  constructor() {
    // Usar CLOUDE_KEY como el usuario configuró (aunque probablemente sea CLAUDE_KEY)
    const apiKey = process.env.CLOUDE_KEY || process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('CLOUDE_KEY, CLAUDE_KEY o ANTHROPIC_API_KEY debe estar configurada en las variables de entorno');
    }
    this.anthropic = new Anthropic({ apiKey });
    this.logger.log('ClaudeService inicializado correctamente');
  }

  /**
   * Procesa un batch de items en una sola llamada a Claude
   * Valida nombre, unidad, cantidad e infiere categoría
   */
  async processItemsBatch(items: RawItemInput[], existingCategories: Category[]): Promise<ProcessedBatchItem[]> {
    const BATCH_SIZE = 5;
    const processedItems: ProcessedBatchItem[] = [];
    const categoriesList = existingCategories.map((cat) => `- ${cat.name} ${cat.emoji}`).join('\n');

    this.logger.log(`Procesando ${items.length} items en batches de ${BATCH_SIZE}...`);

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const batchIndex = i / BATCH_SIZE + 1;
      const totalBatches = Math.ceil(items.length / BATCH_SIZE);
      
      this.logger.log(`Procesando batch ${batchIndex}/${totalBatches} (${batch.length} items)`);

      try {
        const systemPrompt = `Eres un asistente experto en procesar productos de despensa chilena.
Tu tarea es analizar una lista de productos y devolver un JSON estructurado con la información normalizada.

Para cada producto debes:
1. Extraer el nombre del producto normalizado (singular, chileno común, sin marcas).
2. Validar y convertir la unidad de medida (priorizando: gr, kg, L, ml, unit, pack).
3. Convertir cantidades si es necesario (ej: "3 plátanos" -> 3 unit o ≈450 gr).
4. Inferir la categoría más apropiada (usando la lista existente o sugiriendo una nueva).

Unidades válidas: gr, kg, L, ml, unit, pack.

Lista de categorías existentes:
${categoriesList}

IMPORTANTE:
- Responde SOLO con un array JSON.
- Mantén el orden de los items o usa el índice original.
- Si hay error con un item, marca confidence: "low".
`;

        const userPrompt = `Procesa los siguientes productos:

${batch
  .map(
    (item, idx) =>
      `${idx + 1}. Texto: "${item.sourceText}" | Nombre: "${item.name}" | Cantidad: ${item.quantity} | Unidad: "${item.measurementUnit}"`,
  )
  .join('\n')}

Responde con un JSON Array de objetos con esta estructura:
[
  {
    "originalIndex": number, // 1-based index from the list above
    "name": string, // Nombre normalizado
    "quantity": number, // Cantidad numérica
    "unit": string, // gr, kg, L, ml, unit, pack
    "categoryName": string, // Nombre de categoría
    "categoryEmoji": string, // Emoji de categoría
    "confidence": "high" | "medium" | "low",
    "conversionNote": string // Opcional
  }
]`;

        const message = await this.anthropic.messages.create({
          model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        });

        const content = message.content[0];
        if (content.type !== 'text') {
          throw new Error('Respuesta inesperada de Claude: no es texto');
        }

        let jsonText = content.text.trim();
        if (jsonText.startsWith('```')) {
          jsonText = jsonText
            .replace(/^```json\s*/, '')
            .replace(/^```\s*/, '')
            .replace(/\s*```$/, '');
        }

        const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          throw new Error('No se encontró JSON Array válido en la respuesta');
        }

        const results = JSON.parse(jsonMatch[0]) as any[];

        // Mapear resultados al formato ProcessedBatchItem
        for (let j = 0; j < batch.length; j++) {
          const originalItem = batch[j];
          const result = results.find((r) => r.originalIndex === j + 1);

          if (result) {
            // Validar unidad devuelta
            const normalizedUnit = normalizeUnit(result.unit) || MeasurementUnit.OTHER;
            
            processedItems.push({
              name: result.name,
              quantity: result.quantity,
              measurementUnit: normalizedUnit,
              sourceText: originalItem.sourceText,
              confidence: result.confidence || 'medium',
              conversionNote: result.conversionNote,
              categoryName: result.categoryName,
              categoryEmoji: result.categoryEmoji,
            });
          } else {
            // Fallback si Claude no devolvió este item
            this.logger.warn(`Claude no devolvió resultado para item: ${originalItem.name}`);
            const fallbackUnit = normalizeUnit(originalItem.measurementUnit) || MeasurementUnit.OTHER;
            processedItems.push({
              name: originalItem.name,
              quantity: originalItem.quantity,
              measurementUnit: fallbackUnit,
              sourceText: originalItem.sourceText,
              confidence: 'low',
              conversionNote: 'Error: Item no procesado por Claude',
              categoryName: 'Otros',
              categoryEmoji: '📦',
            });
          }
        }
      } catch (error) {
        this.logger.error(`Error procesando batch ${batchIndex}: ${error.message}`);
        // Fallback para todo el batch
        for (const item of batch) {
          const fallbackUnit = normalizeUnit(item.measurementUnit) || MeasurementUnit.OTHER;
          processedItems.push({
            name: item.name,
            quantity: item.quantity,
            measurementUnit: fallbackUnit,
            sourceText: item.sourceText,
            confidence: 'low',
            conversionNote: `Error en batch: ${error.message}`,
            categoryName: 'Otros',
            categoryEmoji: '📦',
          });
        }
      }
    }

    return processedItems;
  }
}
