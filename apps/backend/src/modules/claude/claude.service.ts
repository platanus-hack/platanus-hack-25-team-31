import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { MeasurementUnit } from '../products/entities/measurement-unit.enum';
import { ProductsService } from '../products/products.service';
import { Product } from '../products/entities/product.entity';
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

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly anthropic: Anthropic;

  constructor(
    @Inject(forwardRef(() => ProductsService))
    private readonly productsService: ProductsService,
  ) {
    // Usar CLOUDE_KEY como el usuario configuró (aunque probablemente sea CLAUDE_KEY)
    const apiKey = process.env.CLOUDE_KEY || process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('CLOUDE_KEY, CLAUDE_KEY o ANTHROPIC_API_KEY debe estar configurada en las variables de entorno');
    }
    this.anthropic = new Anthropic({ apiKey });
    this.logger.log('ClaudeService inicializado correctamente');
  }

  /**
   * Parsea el nombre del producto desde sourceText usando Claude
   */
  private async parseProductNameFromSourceText(sourceText: string): Promise<string> {
    const systemPrompt = `Eres un asistente experto en extraer nombres de productos de despensa chilena desde texto de boletas, mensajes o transcripciones.

Tu tarea es extraer el nombre del producto en su forma básica, singular y nombre chileno común.
- Ejemplo: "plat. grnel. 6990xkg 690gr" -> "Plátano"
- Ejemplo: "jgo uva" -> "Jugo de uva"
- Ejemplo: "aceite girasol" -> "Aceite de girasol"
- Ejemplo: "leche entera colun" -> "Leche entera"

IMPORTANTE:
- Usa nombres chilenos comunes (ej: "Palta" no "Aguacate")
- Siempre singular (ej: "Plátano" no "Plátanos")
- Nombres básicos sin marcas (ej: "Leche entera" no "Leche Colun")
- Responde SOLO con el nombre del producto, sin explicaciones`;

    const userPrompt = `Extrae el nombre del producto del siguiente texto:

"${sourceText}"

Responde SOLO con el nombre del producto normalizado, sin explicaciones ni texto adicional.`;

    try {
      const message = await this.anthropic.messages.create({
        // Get model from environment variable
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 100,
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

      return content.text.trim();
    } catch (error) {
      this.logger.error(`Error parseando nombre desde sourceText: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Valida y convierte unidad de medida usando Claude
   * Maneja conversiones (ej: unidad -> gramos) y casos donde el producto no existe en BD
   */
  private async validateAndConvertUnitWithClaude(
    sourceText: string,
    receivedUnit: string,
    receivedQuantity: number,
    productUnit: MeasurementUnit | null,
    productName: string,
    productExists: boolean,
  ): Promise<UnitValidationResult> {
    const systemPrompt = `Eres un asistente experto en validar y convertir unidades de medida de productos de despensa chilena.

Tu tarea es:
1. Determinar la unidad de medida correcta basándote en el sourceText
2. Si el producto existe en BD y tiene una unidad específica, DEBES hacer coincidir la unidad con la de la BD
3. Si hay conversión necesaria (ej: producto en BD se guarda por gramos pero usuario dice "3 plátanos"), 
   debes inferir la conversión aproximada (ej: 1 plátano ≈ 150gr, entonces 3 plátanos ≈ 450gr)
4. Si el producto NO existe en BD, determina la unidad de medida apropiada para guardarlo

Unidades posibles en la base de datos:
- gr: Para productos que se pesan en gramos
- kg: Para productos que se pesan en kilogramos
- L (litros): Para productos líquidos que se miden en litros
- ml: Para productos líquidos que se miden en mililitros
- unit: Para productos que se cuentan por unidades (huevos, frutas individuales, etc.)
- pack: Para productos que vienen en paquetes

Ejemplos de conversiones comunes:
- 1 plátano ≈ 150gr
- 1 huevo ≈ 50gr
- 1 palta ≈ 200gr
- 1 tomate mediano ≈ 150gr
- 1 cebolla mediana ≈ 150gr

IMPORTANTE:
- Si el producto existe en BD, la unidad DEBE coincidir con la de la BD
- Si hay conversión, calcula la cantidad aproximada en la unidad de la BD
- Si el producto no existe, determina la unidad más apropiada según el tipo de producto
- Responde SOLO con un objeto JSON válido`;

    const productInfo = productExists
      ? `El producto "${productName}" EXISTE en la base de datos y se guarda por: ${productUnit}`
      : `El producto "${productName}" NO EXISTE en la base de datos. Debes determinar la unidad apropiada para guardarlo.`;

    const userPrompt = `Valida y convierte la unidad de medida del siguiente producto:

Producto: ${productName}
Texto fuente: "${sourceText}"
Cantidad recibida: ${receivedQuantity}
Unidad recibida: "${receivedUnit}"
${productInfo}

Analiza el sourceText cuidadosamente:
1. Determina la unidad de medida correcta (debe coincidir con la BD si el producto existe)
2. Si hay conversión necesaria, calcula la cantidad aproximada en la unidad de la BD
3. Si el producto no existe, determina la unidad más apropiada

Responde SOLO con un objeto JSON con esta estructura:
{
  "unit": "gr" | "kg" | "L" | "ml" | "unit" | "pack",
  "quantity": número - Cantidad convertida si fue necesario, o la cantidad original si no hubo conversión,
  "conversionNote": "string (opcional) - Nota explicando la conversión realizada"
}`;

    try {
      const message = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 300,
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

      // Parsear el JSON de la respuesta
      let jsonText = content.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText
          .replace(/^```json\s*/, '')
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '');
      }

      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No se encontró JSON válido en la respuesta de Claude');
      }

      const result = JSON.parse(jsonMatch[0]) as { unit: string; quantity: number; conversionNote?: string };

      // Normalizar la unidad devuelta por Claude
      const normalizedUnit = normalizeUnit(result.unit);
      if (!normalizedUnit) {
        this.logger.warn(
          `Claude devolvió unidad no reconocida: ${result.unit}, usando unidad de BD: ${productUnit || MeasurementUnit.OTHER}`,
        );
        return {
          unit: productUnit || MeasurementUnit.OTHER,
          quantity: receivedQuantity,
          conversionNote: `Unidad "${result.unit}" no reconocida, usando unidad por defecto`,
        };
      }

      return {
        unit: normalizedUnit,
        quantity: result.quantity || receivedQuantity,
        conversionNote: result.conversionNote,
      };
    } catch (error) {
      this.logger.error(`Error validando unidad con Claude: ${error.message}`, error.stack);
      // En caso de error, retornar valores por defecto
      return {
        unit: productUnit || MeasurementUnit.OTHER,
        quantity: receivedQuantity,
        conversionNote: `Error en validación: ${error.message}`,
      };
    }
  }

  /**
   * Valida y normaliza un item siguiendo el nuevo flujo
   */
  async validateItem(item: RawItemInput): Promise<ValidatedItem> {
    this.logger.log(`Validando item: ${item.name} (${item.quantity} ${item.measurementUnit})`);

    let productName = item.name;
    let product: Product | null = null;
    let confidence: 'high' | 'medium' | 'low' = 'high';
    let conversionNote: string | undefined;

    // Paso 1: Buscar producto por nombre recibido
    product = await this.productsService.findByName(productName);

    // Paso 2: Si no existe, parsear nombre desde sourceText usando Claude
    if (!product) {
      this.logger.log(`Producto "${productName}" no encontrado, parseando desde sourceText...`);
      try {
        productName = await this.parseProductNameFromSourceText(item.sourceText);
        this.logger.log(`Nombre parseado: "${productName}"`);
        confidence = 'medium'; // Reducir confianza porque tuvimos que parsear

        // Buscar producto nuevamente con el nombre parseado
        product = await this.productsService.findByName(productName);
      } catch (error) {
        this.logger.error(`Error parseando nombre: ${error.message}`);
        confidence = 'low';
        conversionNote = `Error parseando nombre del producto: ${error.message}`;
      }
    }

    // Paso 3: Obtener measurement-unit del producto en BD (si existe)
    const dbUnit: MeasurementUnit | null = product ? product.unit : null;
    const productExists = !!product;

    if (product) {
      this.logger.log(`Producto encontrado: "${product.name}" con unidad: ${dbUnit}`);
    } else {
      this.logger.warn(`Producto "${productName}" no encontrado en BD`);
    }

    // Paso 4: Normalizar unidad recibida usando mapa de sinónimos
    const normalizedReceivedUnit = normalizeUnit(item.measurementUnit);

    // Paso 5: Validar y convertir unidad
    let finalUnit: MeasurementUnit;
    let finalQuantity = item.quantity;

    if (productExists && dbUnit) {
      // Producto existe en BD
      if (normalizedReceivedUnit === dbUnit) {
        // Las unidades coinciden perfectamente
        finalUnit = dbUnit;
        this.logger.log(`Unidades coinciden: ${dbUnit}`);
      } else {
        // Las unidades no coinciden, usar Claude para validar y convertir
        this.logger.log(
          `Unidades no coinciden (recibida: ${normalizedReceivedUnit}, BD: ${dbUnit}), validando y convirtiendo con Claude...`,
        );
        try {
          const validationResult = await this.validateAndConvertUnitWithClaude(
            item.sourceText,
            item.measurementUnit,
            item.quantity,
            dbUnit,
            productName,
            true,
          );

          finalUnit = validationResult.unit;
          finalQuantity = validationResult.quantity;

          // Verificar que Claude respetó la unidad de la BD
          if (finalUnit !== dbUnit) {
            this.logger.warn(`Claude devolvió unidad ${finalUnit} diferente a BD ${dbUnit}, usando unidad de BD`);
            finalUnit = dbUnit;
            // Mantener la conversión de cantidad si Claude la hizo
            if (validationResult.conversionNote) {
              conversionNote = validationResult.conversionNote;
            }
          } else if (validationResult.conversionNote) {
            conversionNote = validationResult.conversionNote;
            confidence = confidence === 'high' ? 'medium' : confidence;
          }
        } catch (error) {
          this.logger.error(`Error validando unidad con Claude: ${error.message}`);
          // Mantener unidad de BD en caso de error
          finalUnit = dbUnit;
        }
      }
    } else {
      // Producto NO existe en BD
      if (normalizedReceivedUnit) {
        // Unidad recibida es reconocida, usarla
        finalUnit = normalizedReceivedUnit;
        confidence = 'medium'; // Reducir confianza porque producto no existe
        conversionNote = `Producto "${productName}" no encontrado en BD, usando unidad recibida: ${normalizedReceivedUnit}`;
      } else {
        // Unidad no reconocida, usar Claude para determinar unidad apropiada
        this.logger.log(`Unidad "${item.measurementUnit}" no reconocida y producto no existe, validando con Claude...`);
        try {
          const validationResult = await this.validateAndConvertUnitWithClaude(
            item.sourceText,
            item.measurementUnit,
            item.quantity,
            null,
            productName,
            false,
          );

          finalUnit = validationResult.unit;
          finalQuantity = validationResult.quantity;
          conversionNote = validationResult.conversionNote || `Unidad determinada por Claude: ${finalUnit}`;
          confidence = 'medium';
        } catch (error) {
          this.logger.error(`Error validando unidad con Claude: ${error.message}`);
          // Usar OTHER como fallback
          finalUnit = MeasurementUnit.OTHER;
          conversionNote = `Error validando unidad, usando OTHER como fallback`;
          confidence = 'low';
        }
      }
    }

    const validated: ValidatedItem = {
      name: productName,
      quantity: finalQuantity,
      measurementUnit: finalUnit,
      sourceText: item.sourceText,
      confidence,
      conversionNote,
    };

    this.logger.log(
      `Item validado: ${validated.name} - ${validated.quantity} ${validated.measurementUnit} (confianza: ${validated.confidence})`,
    );

    return validated;
  }

  /**
   * Valida múltiples items en batch
   */
  async validateItems(items: RawItemInput[]): Promise<ValidatedItem[]> {
    this.logger.log(`Validando ${items.length} items con Claude...`);

    // Validar items en paralelo para mejor performance
    const validationPromises = items.map((item, index) =>
      this.validateItem(item).catch((error) => {
        this.logger.error(`Error validando item ${index + 1}/${items.length} (${item.name}): ${error.message}`);
        // Retornar item con validación fallida pero con datos originales
        const fallbackUnit = normalizeUnit(item.measurementUnit) || MeasurementUnit.OTHER;
        return {
          name: item.name,
          quantity: item.quantity,
          measurementUnit: fallbackUnit,
          sourceText: item.sourceText,
          confidence: 'low' as const,
          conversionNote: `Error en validación: ${error.message}`,
        };
      }),
    );

    const results = await Promise.all(validationPromises);
    const successCount = results.filter((r) => r.confidence !== 'low' || !r.conversionNote?.includes('Error')).length;
    this.logger.log(`Validación completada: ${successCount}/${items.length} items validados exitosamente`);

    return results;
  }

  /**
   * Infiere la categoría de un producto usando Claude
   * Puede seleccionar una categoría existente o sugerir una nueva con emoji
   */
  async inferCategory(productName: string, existingCategories: Category[]): Promise<{ name: string; emoji: string }> {
    const categoriesList = existingCategories.map((cat) => `- ${cat.name} ${cat.emoji}`).join('\n');

    const systemPrompt = `Eres un asistente experto en categorizar productos de despensa chilena.

Tu tarea es determinar la categoría más apropiada para un producto. Puedes:
1. Seleccionar una categoría existente de la lista proporcionada
2. Sugerir una nueva categoría con un emoji apropiado si ninguna categoría existente calza bien

IMPORTANTE:
- Usa nombres de categorías en español chileno
- El emoji debe ser representativo de la categoría
- Si seleccionas una categoría existente, usa exactamente el mismo nombre que aparece en la lista
- Si creas una nueva categoría, elige un nombre claro y descriptivo`;

    const userPrompt = `Determina la categoría para el siguiente producto:

Producto: "${productName}"

Categorías existentes:
${categoriesList || 'No hay categorías existentes'}

Responde SOLO con un objeto JSON con esta estructura:
{
  "name": "string - Nombre de la categoría (debe coincidir exactamente con una existente o ser un nombre nuevo)",
  "emoji": "string - Emoji representativo de la categoría"
}

Si seleccionas una categoría existente, usa exactamente el mismo nombre y emoji que aparece en la lista.
Si creas una nueva categoría, proporciona un nombre descriptivo y un emoji apropiado.`;

    try {
      const message = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 200,
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

      // Parsear el JSON de la respuesta
      let jsonText = content.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText
          .replace(/^```json\s*/, '')
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '');
      }

      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No se encontró JSON válido en la respuesta de Claude');
      }

      const result = JSON.parse(jsonMatch[0]) as { name: string; emoji: string };

      // Verificar si la categoría existe en la lista
      const existingCategory = existingCategories.find((cat) => cat.name.toLowerCase() === result.name.toLowerCase());

      if (existingCategory) {
        // Usar la categoría existente con su emoji original
        this.logger.log(`Categoría existente seleccionada: ${existingCategory.name}`);
        return {
          name: existingCategory.name,
          emoji: existingCategory.emoji,
        };
      }

      // Nueva categoría sugerida
      this.logger.log(`Nueva categoría sugerida: ${result.name} ${result.emoji}`);
      return {
        name: result.name,
        emoji: result.emoji,
      };
    } catch (error) {
      this.logger.error(`Error infiriendo categoría para "${productName}": ${error.message}`, error.stack);
      // Fallback: usar categoría "Otros" o crear una por defecto
      const defaultCategory = existingCategories.find((cat) => cat.name.toLowerCase() === 'otros') || {
        name: 'Otros',
        emoji: '📦',
      };
      return defaultCategory;
    }
  }
}
