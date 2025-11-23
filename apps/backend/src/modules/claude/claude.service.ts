import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { MeasurementUnit } from '../products/entities/measurement-unit.enum';
import { Category } from '../categories/entities/category.entity';
import { Product } from '../products/entities/product.entity';
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

export interface ProcessedBatchItem extends ValidatedItem {
  categoryName: string;
  categoryEmoji: string;
}

interface ClaudeResult {
  originalIndex: number;
  name: string;
  quantity: number;
  unit: string;
  categoryName: string;
  categoryEmoji: string;
  confidence?: 'high' | 'medium' | 'low';
  conversionNote?: string;
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
   * Busca los 3 productos más similares a un nombre dado
   * Usa búsqueda LIKE y ordenamiento básico por relevancia
   */
  findSimilarProductNames(productName: string, existingProducts: Product[]): string[] {
    const normalizedSearch = productName.toLowerCase().trim();

    // Filtrar productos que contengan el nombre buscado (case-insensitive)
    const matchingProducts = existingProducts
      .filter(
        (product) =>
          product.name.toLowerCase().includes(normalizedSearch) ||
          normalizedSearch.includes(product.name.toLowerCase()),
      )
      .map((product) => ({
        name: product.name,
        // Calcular relevancia: preferir matches exactos o que empiecen con el término
        relevance:
          product.name.toLowerCase() === normalizedSearch
            ? 100
            : product.name.toLowerCase().startsWith(normalizedSearch)
              ? 80
              : normalizedSearch.startsWith(product.name.toLowerCase())
                ? 70
                : product.name.length - Math.abs(product.name.length - normalizedSearch.length),
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3)
      .map((p) => p.name);

    return matchingProducts;
  }

  /**
   * Procesa un batch de items en una sola llamada a Claude
   * Valida nombre, unidad, cantidad e infiere categoría
   */
  async processItemsBatch(
    items: RawItemInput[],
    existingCategories: Category[],
    existingProducts: Product[] = [],
  ): Promise<ProcessedBatchItem[]> {
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
        // Preparar nombres similares para cada item del batch
        const itemsWithSimilarNames = batch.map((item) => {
          const similarNames = this.findSimilarProductNames(item.name, existingProducts);
          return {
            ...item,
            similarNames,
          };
        });

        const systemPrompt = `Eres un asistente experto en procesar productos de despensa chilena.
Tu tarea es analizar una lista de productos y devolver un JSON estructurado con la información normalizada.

Para cada producto debes:
1. Seleccionar el nombre del producto:
   - Si se proporcionan nombres similares existentes, DEBES seleccionar uno de ellos si corresponde al producto.
   - Si ninguno de los nombres similares corresponde al producto, crea un nombre nuevo normalizado (singular, chileno común, sin marcas).
   - IMPORTANTE: El nombre debe tener capitalización correcta (primera letra en mayúscula, resto según corresponda). Ejemplos: "Arroz", "Aceite de oliva", "Leche entera".
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
- SIEMPRE usa capitalización correcta en los nombres (primera letra mayúscula).
`;

        const userPrompt = `Procesa los siguientes productos:

${itemsWithSimilarNames
  .map((item, idx) => {
    const similarNamesText =
      item.similarNames.length > 0
        ? `\n   Nombres similares existentes: ${item.similarNames.map((n) => `"${n}"`).join(', ')}`
        : '\n   No se encontraron nombres similares en la base de datos.';
    return `${idx + 1}. Texto: "${item.sourceText}" | Nombre: "${item.name}" | Cantidad: ${item.quantity} | Unidad: "${item.measurementUnit}"${similarNamesText}`;
  })
  .join('\n\n')}

Responde con un JSON Array de objetos con esta estructura:
[
  {
    "originalIndex": number, // 1-based index from the list above
    "name": string, // Nombre normalizado (seleccionar de los similares si corresponde, o crear uno nuevo). DEBE tener capitalización correcta.
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

        const results = JSON.parse(jsonMatch[0]) as ClaudeResult[];

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

  /**
   * Genera una predicción de despensa basada en el perfil del hogar
   */
  async generatePantryPrediction(homeProfile: {
    income: number;
    foodType: string;
    people: { age: number; gender: string; eatingRate: string; sportRate: string }[];
  }): Promise<RawItemInput[]> {
    const model = process.env.CLOUDE_MODEL_PRO || process.env.CLOUDE_MODEL || 'claude-3-opus-20240229';

    const systemPrompt = `Eres un experto sociólogo y planificador de hogar chileno.
Tu tarea es generar un inventario INICIAL COMPLETO y DETALLADO de despensa para un hogar en Chile, basado en sus características.
Debes estimar qué productos y en qué cantidades tendrían almacenados.

Reglas:
1. Sé MUY EXTENSO y DETALLADO. Incluye abarrotes, lácteos, congelados, limpieza, aseo personal, etc.
2. Usa nombres de productos comunes en Chile (ej: "Marraqueta", "Arroz", "Aceite de oliva", "Detergente", "Yogur de vainilla").
3. Estima cantidades realistas para un stock inicial.
4. Responde con productos genéricos, no especifiques marca, pero sí tipos y variedades.
5. IMPORTANTE: Usa la herramienta 'submit_pantry_prediction' para enviar tu respuesta.`;

    const userPrompt = `Genera una despensa completa para este hogar chileno:
Ingreso mensual aproximado: $${homeProfile.income}
Tipo de alimentación: ${homeProfile.foodType}
Integrantes:
${homeProfile.people
  .map((p) => `- Edad: ${p.age}, Género: ${p.gender}, Nivel comida: ${p.eatingRate}, Deporte: ${p.sportRate}`)
  .join('\n')}

Genera al menos 50-80 productos esenciales y variados que deberían tener.`;

    try {
      const message = await this.anthropic.messages.create({
        model,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        tools: [
          {
            name: 'submit_pantry_prediction',
            description: 'Submit the predicted pantry inventory list containing multiple items.',
            input_schema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Nombre del producto (genérico, chileno)',
                      },
                      quantity: {
                        type: 'number',
                        description: 'Cantidad numérica',
                      },
                      measurementUnit: {
                        type: 'string',
                        enum: ['gr', 'kg', 'L', 'ml', 'unit', 'pack'],
                        description: 'Unidad de medida',
                      },
                    },
                    required: ['name', 'quantity', 'measurementUnit'],
                  },
                },
              },
              required: ['items'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'submit_pantry_prediction' },
      });

      // Buscar el uso de la herramienta en la respuesta
      const toolUse = message.content.find((block) => block.type === 'tool_use');

      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('Claude no usó la herramienta requerida para la respuesta estructurada');
      }

      const result = toolUse.input as { items: { name: string; quantity: number; measurementUnit: string }[] };

      return result.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        measurementUnit: item.measurementUnit,
        sourceText: `${item.quantity} ${item.measurementUnit} ${item.name}`,
      }));
    } catch (error) {
      this.logger.error(`Error generando predicción de despensa: ${error.message}`);
      return [];
    }
  }
}
