import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { User } from '../../users/entities/user.entity';
import { DataLoadItems } from '../../data-load-items/entities/data-load-items.entity';
import { InventoryMovement } from '../../inventory-movements/entities/inventory-movement.entity';
import { MeasurementUnit } from './measurement-unit.enum';

export { MeasurementUnit };

@Entity('products')
export class Product extends BaseEntity {
  @Column()
  name: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({
    name: 'measurement_unit',
    type: 'enum',
    enum: MeasurementUnit,
  })
  measurementUnit: MeasurementUnit;

  @Column({ name: 'estimated_stock', type: 'decimal', precision: 10, scale: 2 })
  estimatedStock: number;

  @Column({ name: 'daily_consumption', type: 'decimal', precision: 10, scale: 2 })
  dailyConsumption: number;

  @Column({ name: 'critical_stock', type: 'decimal', precision: 10, scale: 2 })
  criticalStock: number;

  @Column()
  category: string;

  // Relations
  @ManyToOne(() => User, (user) => user.products)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @OneToMany(() => DataLoadItems, (dataLoadItems) => dataLoadItems.product)
  dataLoadItems?: DataLoadItems[];

  @OneToMany(() => InventoryMovement, (movement) => movement.product)
  inventoryMovements?: InventoryMovement[];
}
