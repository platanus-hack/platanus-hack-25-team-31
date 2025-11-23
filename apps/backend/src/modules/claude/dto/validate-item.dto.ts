// DTOs para validación de items con Claude
export interface ValidateItemDto {
  name: string;
  quantity: number;
  measurementUnit: string;
  sourceText: string;
}

export interface BulkValidateItemsDto {
  userId: string;
  items: ValidateItemDto[];
  sourceType: 'receipt' | 'manual';
}

