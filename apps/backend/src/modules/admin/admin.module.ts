import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UserProduct } from '../user-products/entities/user-product.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserProduct, InventoryMovement])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
