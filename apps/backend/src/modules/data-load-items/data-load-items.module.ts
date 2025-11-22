import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataLoadItems } from './entities/data-load-items.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DataLoadItems])],
  exports: [TypeOrmModule],
})
export class DataLoadItemsModule {}

