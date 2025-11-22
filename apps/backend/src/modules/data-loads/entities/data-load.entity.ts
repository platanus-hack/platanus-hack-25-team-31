import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { User } from '../../users/entities/user.entity';
import { DataLoadItems } from '../../data-load-items/entities/data-load-items.entity';
import { InventoryMovement } from '../../inventory-movements/entities/inventory-movement.entity';

export enum SourceType {
  RECEIPT = 'receipt',
  MANUAL = 'manual',
}

@Entity('data_loads')
export class DataLoad extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: SourceType,
  })
  sourceType: SourceType;

  @Column({ name: 'load_date', type: 'date' })
  loadDate: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.dataLoads)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @OneToMany(() => DataLoadItems, (dataLoadItems) => dataLoadItems.dataLoad)
  dataLoadItems?: DataLoadItems[];

  @OneToMany(() => InventoryMovement, (movement) => movement.sourceLoad)
  inventoryMovements?: InventoryMovement[];
}

