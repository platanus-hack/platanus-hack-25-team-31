import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { UserProductsService } from './user-products.service';
import { AgentTokenGuard } from '../auth/guards/agent-token.guard';
import type { BulkUploadDto } from './dto/bulk-upload.dto';

@Controller('user-products')
export class UserProductsController {
  constructor(private readonly userProductsService: UserProductsService) {}

  @UseGuards(AgentTokenGuard)
  @Get('buy-products/user/:userId')
  async getBuyProducts(@Param('userId') userId: string) {
    return this.userProductsService.getBuyProducts(userId);
  }

  @UseGuards(AgentTokenGuard)
  @Get('agent-all/:userId')
  async getAllProductsForAgent(@Param('userId') userId: string) {
    return this.userProductsService.getAllProductsForAgent(userId);
  }

  @UseGuards(AgentTokenGuard)
  @Post('bulk-upload/:userId')
  async bulkUpload(@Param('userId') userId: string, @Body() dto: BulkUploadDto) {
    return this.userProductsService.bulkUpload(userId, dto);
  }
}
