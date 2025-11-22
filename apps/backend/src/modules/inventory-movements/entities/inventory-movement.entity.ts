import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';
import { DataLoad } from '../../data-loads/entities/data-load.entity';

export enum MovementType {
  IN = 'in',
  OUT = 'out',
  ADJUSTMENT = 'adjustment',
}

@Entity('inventory_movements')
export class InventoryMovement extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({
    name: 'movement_type',
    type: 'enum',
    enum: MovementType,
  })
  movementType: MovementType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ name: 'source_load_id', nullable: true })
  sourceLoadId: string | null;

  // Relations
  @ManyToOne(() => User, (user) => user.inventoryMovements)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne(() => Product, (product) => product.inventoryMovements)
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @ManyToOne(() => DataLoad, (dataLoad) => dataLoad.inventoryMovements, {
    nullable: true,
  })
  @JoinColumn({ name: 'source_load_id' })
  sourceLoad?: DataLoad | null;
}
