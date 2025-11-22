import { Entity, Column, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { Home } from '../../homes/entities/home.entity';
import { UserProduct } from '../../user-products/entities/user-product.entity';
import { DataLoad } from '../../data-loads/entities/data-load.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ name: 'phone_number', unique: true })
  phoneNumber: string;

  @Column()
  name: string;

  @Column({ name: 'otp_code', nullable: true })
  otpCode?: string;

  @Column({ name: 'otp_expires_at', type: 'timestamp', nullable: true })
  otpExpiresAt?: Date;

  // Relations
  @OneToOne(() => Home, (home) => home.user)
  home?: Home;

  @OneToMany(() => UserProduct, (userProduct) => userProduct.user)
  userProducts?: UserProduct[];

  @OneToMany(() => DataLoad, (dataLoad) => dataLoad.user)
  dataLoads?: DataLoad[];
}
