import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('categories')
export class Category extends BaseEntity {
  @Column()
  name: string;

  @Column()
  emoji: string;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
