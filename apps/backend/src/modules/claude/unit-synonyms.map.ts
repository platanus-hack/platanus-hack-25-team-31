import { MeasurementUnit } from '../products/entities/measurement-unit.enum';

/**
 * Mapa de sinónimos de unidades de medida hacia los valores del enum MeasurementUnit
 * Incluye variantes en español, inglés, diminutivos y abreviaciones comunes
 */
export const UNIT_SYNONYMS_MAP: Map<string, MeasurementUnit> = new Map([
  // Gramos
  ['gr', MeasurementUnit.GRAM],
  ['g', MeasurementUnit.GRAM],
  ['gram', MeasurementUnit.GRAM],
  ['gramo', MeasurementUnit.GRAM],
  ['gramos', MeasurementUnit.GRAM],
  ['grams', MeasurementUnit.GRAM],
  ['grs', MeasurementUnit.GRAM],
  // Kilogramos
  ['kg', MeasurementUnit.KILOGRAM],
  ['kilogram', MeasurementUnit.KILOGRAM],
  ['kilogramo', MeasurementUnit.KILOGRAM],
  ['kilogramos', MeasurementUnit.KILOGRAM],
  ['kilo', MeasurementUnit.KILOGRAM],
  ['kilos', MeasurementUnit.KILOGRAM],
  ['kilogramme', MeasurementUnit.KILOGRAM],
  ['kilogrammes', MeasurementUnit.KILOGRAM],
  // Litros
  ['l', MeasurementUnit.LITER],
  ['L', MeasurementUnit.LITER],
  ['litro', MeasurementUnit.LITER],
  ['litros', MeasurementUnit.LITER],
  ['liter', MeasurementUnit.LITER],
  ['liters', MeasurementUnit.LITER],
  ['litre', MeasurementUnit.LITER],
  ['litres', MeasurementUnit.LITER],
  // Mililitros
  ['ml', MeasurementUnit.MILLILITER],
  ['mililitro', MeasurementUnit.MILLILITER],
  ['mililitros', MeasurementUnit.MILLILITER],
  ['milliliter', MeasurementUnit.MILLILITER],
  ['milliliters', MeasurementUnit.MILLILITER],
  ['millilitre', MeasurementUnit.MILLILITER],
  ['millilitres', MeasurementUnit.MILLILITER],
  // Unidad
  ['unit', MeasurementUnit.UNIT],
  ['unidad', MeasurementUnit.UNIT],
  ['unidades', MeasurementUnit.UNIT],
  ['units', MeasurementUnit.UNIT],
  ['u', MeasurementUnit.UNIT],
  ['pz', MeasurementUnit.UNIT], // pieza
  ['pza', MeasurementUnit.UNIT], // pieza
  ['pieza', MeasurementUnit.UNIT],
  ['piezas', MeasurementUnit.UNIT],
  ['pcs', MeasurementUnit.UNIT], // pieces
  ['piece', MeasurementUnit.UNIT],
  ['pieces', MeasurementUnit.UNIT],
  // Pack
  ['pack', MeasurementUnit.PACK],
  ['paquete', MeasurementUnit.PACK],
  ['paquetes', MeasurementUnit.PACK],
  ['pkg', MeasurementUnit.PACK],
  ['package', MeasurementUnit.PACK],
  ['packages', MeasurementUnit.PACK],
]);

/**
 * Normaliza una unidad de medida usando el mapa de sinónimos
 * @param unit - Unidad de medida a normalizar
 * @returns MeasurementUnit normalizado o null si no se encuentra
 */
export function normalizeUnit(unit: string): MeasurementUnit | null {
  const normalized = unit.toLowerCase().trim();
  return UNIT_SYNONYMS_MAP.get(normalized) || null;
}

