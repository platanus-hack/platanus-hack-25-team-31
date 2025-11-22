import { Controller, Get, Param } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('user/:userId')
  async findAllByUser(@Param('userId') userId: string): Promise<Product[]> {
    return this.productsService.findAllByUser(userId);
  }
}
