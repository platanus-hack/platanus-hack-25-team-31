import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async isUserAdmin(id: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) return false;
    return user.phoneNumber === '+56900000001';
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | Record<string, never>> {
    const user = await this.userRepository.findOne({
      where: { phoneNumber },
    });

    return user || {};
  }
}
