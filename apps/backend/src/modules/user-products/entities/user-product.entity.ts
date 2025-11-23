import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';
import { DataLoadItems } from '../../data-load-items/entities/data-load-items.entity';
import { InventoryMovement } from '../../inventory-movements/entities/inventory-movement.entity';

@Entity('user_products')
export class UserProduct extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ name: 'estimated_stock', type: 'decimal', precision: 10, scale: 2 })
  estimatedStock: number;

  @Column({ name: 'daily_consumption', type: 'decimal', precision: 10, scale: 2 })
  dailyConsumption: number;

  @Column({ name: 'critical_stock', type: 'decimal', precision: 10, scale: 2 })
  criticalStock: number;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Product, (product) => product.userProducts)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @OneToMany(() => DataLoadItems, (item) => item.userProduct)
  dataLoadItems: DataLoadItems[];

  @OneToMany(() => InventoryMovement, (movement) => movement.userProduct)
  inventoryMovements: InventoryMovement[];
}
