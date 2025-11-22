export enum Category {
  ABARROTES = 'ABARROTES',
  GOLOSINAS = 'GOLOSINAS',
  FRUTAS = 'FRUTAS',
  VERDURAS = 'VERDURAS',
  PAN = 'PAN',
  CARNE = 'CARNE',
  LACTEOS = 'LACTEOS',
  HIGIENE_SALUD_BELLEZA = 'HIGIENE_SALUD_BELLEZA',
  MASCOTA = 'MASCOTA',
  LIMPIEZA = 'LIMPIEZA',
  FARMACIA = 'FARMACIA',
  ALCOHOLES = 'ALCOHOLES',
  BEBIDAS = 'BEBIDAS',
}

export const CategoryEmojis: Record<Category, string> = {
  [Category.ABARROTES]: '🍚',
  [Category.GOLOSINAS]: '🍬',
  [Category.FRUTAS]: '🍎',
  [Category.VERDURAS]: '🥦',
  [Category.PAN]: '🍞',
  [Category.CARNE]: '🥩',
  [Category.LACTEOS]: '🥛',
  [Category.HIGIENE_SALUD_BELLEZA]: '🧴',
  [Category.MASCOTA]: '🐶',
  [Category.LIMPIEZA]: '🧹',
  [Category.FARMACIA]: '💊',
  [Category.ALCOHOLES]: '🍷',
  [Category.BEBIDAS]: '🥤',
};

export type Unit = 'GRAMS' | 'UNITS' | 'LITERS' | 'KILOS' | 'MILLILITERS';

export interface Product {
  id: string;
  name: string;
  userId: string;
  unit: Unit;
  category: Category;
  estimatedStock: number; // decimal treated as number
  dailyConsumption: number; // decimal treated as number
  criticalStock: boolean;
}
