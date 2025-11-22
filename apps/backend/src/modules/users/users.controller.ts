import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('phone/:phoneNumber')
  async findByPhoneNumber(@Param('phoneNumber') phoneNumber: string): Promise<User | Record<string, never>> {
    return this.usersService.findByPhoneNumber(phoneNumber);
  }
}
