import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserProduct } from '../user-products/entities/user-product.entity';
import { InventoryMovement, MovementType } from '../inventory-movements/entities/inventory-movement.entity';

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserProduct)
    private readonly userProductRepo: Repository<UserProduct>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
  ) {}

  async advanceDay() {
    // 1. Shift history back 1 day (Time Travel: The Universe moves, we stay)
    // This makes previous movements happen "yesterday", clearing "today" for new events.
    await this.dataSource.query(`UPDATE inventory_movements SET created_at = created_at - INTERVAL '1 day'`);

    // 2. Simulate "Today's" consumption for ALL products
    const products = await this.userProductRepo.find();

    for (const product of products) {
      const consumption = Number(product.dailyConsumption);
      if (consumption <= 0) continue;

      // Add small variation (+/- 10%) to make it realistic
      const variation = 0.9 + Math.random() * 0.2;
      const actualConsumption = Number((consumption * variation).toFixed(2));

      let newStock = Number(product.quantity) - actualConsumption;
      if (newStock < 0) newStock = 0;

      // Update UserProduct state
      product.quantity = newStock;
      product.estimatedStock = newStock;
      await this.userProductRepo.save(product);

      // Record Movement (OUT) for Today (NOW)
      const movement = this.movementRepo.create({
        userProductId: product.id,
        movementType: MovementType.OUT,
        quantity: actualConsumption,
        stockAfter: newStock,
        // createdAt defaults to NOW, which is what we want for "Today"
      });
      await this.movementRepo.save(movement);
    }

    return { success: true, message: 'Day advanced successfully (History shifted)' };
  }
}
