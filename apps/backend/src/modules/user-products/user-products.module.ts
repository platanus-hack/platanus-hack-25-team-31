import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProduct } from './entities/user-product.entity';
import { UserProductsService } from './user-products.service';
import { UserProductsController } from './user-products.controller';
import { Product } from '../products/entities/product.entity';
import { Category } from '../categories/entities/category.entity';
import { DataLoad } from '../data-loads/entities/data-load.entity';
import { DataLoadItems } from '../data-load-items/entities/data-load-items.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { ClaudeModule } from '../claude/claude.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProduct, Product, Category, DataLoad, DataLoadItems, InventoryMovement]),
    forwardRef(() => ClaudeModule),
  ],
  controllers: [UserProductsController],
  providers: [UserProductsService],
  exports: [TypeOrmModule, UserProductsService],
})
export class UserProductsModule {}
