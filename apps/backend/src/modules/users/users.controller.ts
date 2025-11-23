import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AgentTokenGuard } from '../auth/guards/agent-token.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id/is-admin')
  async isUserAdmin(@Param('id') id: string): Promise<{ isAdmin: boolean }> {
    const isAdmin = await this.usersService.isUserAdmin(id);
    return { isAdmin };
  }

  @UseGuards(AgentTokenGuard)
  @Get('phone/:phoneNumber')
  async findByPhoneNumber(@Param('phoneNumber') phoneNumber: string): Promise<User | Record<string, never>> {
    return this.usersService.findByPhoneNumber(phoneNumber);
  }
}
