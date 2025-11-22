import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { UserProduct } from '../../user-products/entities/user-product.entity';
import { DataLoad } from '../../data-loads/entities/data-load.entity';

export enum MovementType {
  IN = 'in',
  OUT = 'out',
  ADJUSTMENT = 'adjustment',
}

@Entity('inventory_movements')
export class InventoryMovement extends BaseEntity {
  @Column({ name: 'user_product_id' })
  userProductId: string;

  @Column({
    name: 'movement_type',
    type: 'enum',
    enum: MovementType,
  })
  movementType: MovementType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ name: 'stock_after', type: 'decimal', precision: 10, scale: 2 })
  stockAfter: number;

  @Column({ name: 'source_load_id', nullable: true })
  sourceLoadId: string | null;

  // Relations
  @ManyToOne(() => UserProduct, (userProduct) => userProduct.inventoryMovements)
  @JoinColumn({ name: 'user_product_id' })
  userProduct?: UserProduct;

  @ManyToOne(() => DataLoad, (dataLoad) => dataLoad.inventoryMovements, {
    nullable: true,
  })
  @JoinColumn({ name: 'source_load_id' })
  sourceLoad?: DataLoad | null;
}
