import { Controller, Get, Param } from '@nestjs/common';
import { ProductsService } from './products.service';
import { UserProduct } from '../user-products/entities/user-product.entity';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('user/:userId')
  async findAllByUser(@Param('userId') userId: string): Promise<UserProduct[]> {
    return this.productsService.findAllByUser(userId);
  }
}
