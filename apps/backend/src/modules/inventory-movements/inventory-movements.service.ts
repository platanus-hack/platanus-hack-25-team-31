import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryMovement } from './entities/inventory-movement.entity';

@Injectable()
export class InventoryMovementsService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly repo: Repository<InventoryMovement>,
  ) {}

  async findAllByUser(userId: string): Promise<InventoryMovement[]> {
    return this.repo
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.userProduct', 'userProduct')
      .where('userProduct.userId = :userId', { userId })
      .orderBy('movement.createdAt', 'ASC')
      .getMany();
  }
}
