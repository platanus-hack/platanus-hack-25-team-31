import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { Home } from '../../homes/entities/home.entity';

export enum EatingRate {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

export enum SportRate {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

@Entity('people')
export class Person extends BaseEntity {
  @Column({ type: 'int' })
  age: number;

  @Column({
    name: 'eating_rate',
    type: 'enum',
    enum: EatingRate,
  })
  eatingRate: EatingRate;

  @Column({
    type: 'enum',
    enum: Gender,
  })
  gender: Gender;

  @Column({
    name: 'sport_rate',
    type: 'enum',
    enum: SportRate,
  })
  sportRate: SportRate;

  @Column({ name: 'home_id' })
  homeId: string;

  // Relations
  @ManyToOne(() => Home, (home) => home.people)
  @JoinColumn({ name: 'home_id' })
  home?: Home;
}

