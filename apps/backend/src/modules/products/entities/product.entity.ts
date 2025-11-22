import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { MeasurementUnit } from './measurement-unit.enum';
import { Category } from '../../categories/entities/category.entity';
import { UserProduct } from '../../user-products/entities/user-product.entity';

export { MeasurementUnit };

@Entity('products')
export class Product extends BaseEntity {
  @Column()
  name: string;

  @Column({
    name: 'unit',
    type: 'enum',
    enum: MeasurementUnit,
  })
  unit: MeasurementUnit;

  @Column({ name: 'category_id' })
  categoryId: string;

  // Relations
  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToMany(() => UserProduct, (userProduct) => userProduct.product)
  userProducts: UserProduct[];
}
