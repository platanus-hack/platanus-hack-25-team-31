import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProduct } from './entities/user-product.entity';
import { UserProductsService } from './user-products.service';
import { UserProductsController } from './user-products.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserProduct])],
  controllers: [UserProductsController],
  providers: [UserProductsService],
  exports: [TypeOrmModule, UserProductsService],
})
export class UserProductsModule {}

