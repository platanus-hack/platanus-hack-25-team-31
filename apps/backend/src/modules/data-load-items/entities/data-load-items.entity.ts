import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { DataLoad } from '../../data-loads/entities/data-load.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('data_load_items')
export class DataLoadItems extends BaseEntity {
  @Column({ name: 'data_load_id' })
  dataLoadId: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  // Relations
  @ManyToOne(() => DataLoad, (dataLoad) => dataLoad.dataLoadItems)
  @JoinColumn({ name: 'data_load_id' })
  dataLoad?: DataLoad;

  @ManyToOne(() => Product, (product) => product.dataLoadItems)
  @JoinColumn({ name: 'product_id' })
  product?: Product;
}

