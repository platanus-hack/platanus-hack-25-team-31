import { Entity, Column, OneToMany, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { User } from '../../users/entities/user.entity';
import { Person } from '../../people/entities/person.entity';

export enum FoodType {
  PROCESS_FOOD = 'process_food',
  VEGETARIAN = 'vegetarian',
  HEALTHY = 'healthy',
  BALANCED = 'balanced',
  OTHER = 'other',
}

@Entity('homes')
export class Home extends BaseEntity {
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  income: number;

  @Column({
    name: 'food_type',
    type: 'enum',
    enum: FoodType,
  })
  foodType: FoodType;

  @Column({ name: 'user_id' })
  userId: string;

  // Relations
  @OneToOne(() => User, (user) => user.home)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @OneToMany(() => Person, (person) => person.home)
  people?: Person[];
}
