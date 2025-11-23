import { MovementType } from '../../inventory-movements/entities/inventory-movement.entity';
import { SourceType } from '../../data-loads/entities/data-load.entity';

export interface BulkProductInput {
  name: string;
  quantity: number;
  sourceText: string;
  measurementUnit: string;
}

export interface BulkUploadDto {
  movementType: MovementType;
  sourceType: SourceType;
  products: BulkProductInput[];
}

