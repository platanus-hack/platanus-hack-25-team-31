import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProduct } from './entities/user-product.entity';

interface BuyProductResponse {
  name: string;
  category: string;
  estimatedStock: number;
  recommendedBuyQuantity: number;
  unit: string;
}

interface AgentAllProductResponse {
  name: string;
  category: string;
  estimatedStock: number;
  dailyConsumption: number;
  criticalStock: number;
  unit: string;
}

@Injectable()
export class UserProductsService {
  constructor(
    @InjectRepository(UserProduct)
    private readonly userProductRepository: Repository<UserProduct>,
  ) {}

  async getBuyProducts(userId: string): Promise<BuyProductResponse[]> {
    // Get purchase duration days from environment variable, default to 10
    const purchaseDurationDays = parseInt(process.env.PURCHASE_DURATION_DAYS || '10', 10);

    // Query user products with filter applied in SQL query
    // Filter: estimatedStock < dailyConsumption * purchaseDurationDays
    const userProducts = await this.userProductRepository
      .createQueryBuilder('userProduct')
      .leftJoinAndSelect('userProduct.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('userProduct.userId = :userId', { userId })
      .andWhere('userProduct.estimated_stock < userProduct.daily_consumption * :purchaseDurationDays', {
        purchaseDurationDays,
      })
      .getMany();

    // Map to response format
    return userProducts.map((userProduct) => {
      const targetStock = Number(userProduct.dailyConsumption) * purchaseDurationDays;
      const recommendedBuyQuantity = targetStock - Number(userProduct.estimatedStock);

      return {
        name: userProduct.product.name,
        category: userProduct.product.category.name,
        estimatedStock: Number(userProduct.estimatedStock),
        recommendedBuyQuantity: parseFloat(Math.max(0, recommendedBuyQuantity).toFixed(2)),
        unit: userProduct.product.unit,
      };
    });
  }

  async getAllProductsForAgent(userId: string): Promise<AgentAllProductResponse[]> {
    // Query all user products with product and category relations
    const userProducts = await this.userProductRepository.find({
      where: { userId },
      relations: ['product', 'product.category'],
    });

    // Map to response format
    return userProducts.map((userProduct) => {
      return {
        name: userProduct.product.name,
        category: userProduct.product.category.name,
        estimatedStock: Number(userProduct.estimatedStock),
        dailyConsumption: Number(userProduct.dailyConsumption),
        criticalStock: Number(userProduct.criticalStock),
        unit: userProduct.product.unit,
      };
    });
  }
}
