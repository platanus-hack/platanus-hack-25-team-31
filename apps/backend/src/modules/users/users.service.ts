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

  async findByPhoneNumber(
    phoneNumber: string,
  ): Promise<User | Record<string, never>> {
    const user = await this.userRepository.findOne({
      where: { phoneNumber },
    });

    return user || {};
  }
}

