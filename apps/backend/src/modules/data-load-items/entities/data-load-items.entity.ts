import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { DataLoad } from '../../data-loads/entities/data-load.entity';
import { UserProduct } from '../../user-products/entities/user-product.entity';

@Entity('data_load_items')
export class DataLoadItems extends BaseEntity {
  @Column({ name: 'data_load_id' })
  dataLoadId: string;

  @Column({ name: 'user_product_id' })
  userProductId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  // Relations
  @ManyToOne(() => DataLoad, (dataLoad) => dataLoad.dataLoadItems)
  @JoinColumn({ name: 'data_load_id' })
  dataLoad?: DataLoad;

  @ManyToOne(() => UserProduct, (userProduct) => userProduct.dataLoadItems)
  @JoinColumn({ name: 'user_product_id' })
  userProduct?: UserProduct;
}
