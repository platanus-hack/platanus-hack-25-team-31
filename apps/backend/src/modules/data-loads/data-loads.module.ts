import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataLoad } from './entities/data-load.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DataLoad])],
  exports: [TypeOrmModule],
})
export class DataLoadsModule {}

