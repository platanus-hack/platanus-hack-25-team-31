import { Controller, Get, Param } from '@nestjs/common';
import { InventoryMovementsService } from './inventory-movements.service';

@Controller('inventory-movements')
export class InventoryMovementsController {
  constructor(private readonly service: InventoryMovementsService) {}

  @Get('user/:userId')
  async findAllByUser(@Param('userId') userId: string) {
    return this.service.findAllByUser(userId);
  }
}
