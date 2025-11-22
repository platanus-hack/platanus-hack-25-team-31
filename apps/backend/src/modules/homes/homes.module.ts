import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Home } from './entities/home.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Home])],
  exports: [TypeOrmModule],
})
export class HomesModule {}

