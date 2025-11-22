import { Entity, Column, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { Home } from '../../homes/entities/home.entity';
import { Product } from '../../products/entities/product.entity';
import { DataLoad } from '../../data-loads/entities/data-load.entity';
import { InventoryMovement } from '../../inventory-movements/entities/inventory-movement.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ name: 'phone_number', unique: true })
  phoneNumber: string;

  @Column()
  name: string;

  // Relations
  @OneToOne(() => Home, (home) => home.user)
  home?: Home;

  @OneToMany(() => Product, (product) => product.user)
  products?: Product[];

  @OneToMany(() => DataLoad, (dataLoad) => dataLoad.user)
  dataLoads?: DataLoad[];

  @OneToMany(() => InventoryMovement, (movement) => movement.user)
  inventoryMovements?: InventoryMovement[];
}
