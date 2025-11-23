import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserProductsService } from '../user-products/user-products.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userProductsService: UserProductsService,
  ) {}

  async advanceDay() {
    // 1. Shift history back 1 day (Time Travel: The Universe moves, we stay)
    // This makes previous movements happen "yesterday", clearing "today" for new events.
    await this.dataSource.query(`UPDATE inventory_movements SET created_at = created_at - INTERVAL '1 day'`);

    // 2. Reduce daily stock using the optimized service method
    const result = await this.userProductsService.reduceDailyStock();

    return {
      success: true,
      message: 'Day advanced successfully (History shifted)',
      productsUpdated: result.productsUpdated,
      movementsCreated: result.movementsCreated,
    };
  }
}
