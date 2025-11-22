import { Controller, Get, Param } from '@nestjs/common';
import { UserProductsService } from './user-products.service';

@Controller('user-products')
export class UserProductsController {
  constructor(private readonly userProductsService: UserProductsService) {}

  @Get('buy-products/user/:userId')
  async getBuyProducts(@Param('userId') userId: string) {
    return this.userProductsService.getBuyProducts(userId);
  }
}

