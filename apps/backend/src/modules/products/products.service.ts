import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { UserProduct } from '../user-products/entities/user-product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(UserProduct)
    private readonly userProductRepository: Repository<UserProduct>,
  ) {}

  async findAllByUser(userId: string): Promise<UserProduct[]> {
    return this.userProductRepository.find({
      where: { userId },
      relations: ['product', 'product.category'],
      order: {
        product: {
          name: 'ASC',
        },
      },
    });
  }
}
