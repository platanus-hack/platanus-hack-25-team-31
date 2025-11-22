import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async generatePin(phone: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { phoneNumber: phone } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digits
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours validity

    user.otpCode = pin;
    user.otpExpiresAt = expiresAt;
    await this.userRepository.save(user);

    return pin;
  }

  async validatePin(userId: string, pin: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return false;

    if (!user.otpCode || !user.otpExpiresAt) return false;

    const now = new Date();
    if (now > user.otpExpiresAt) return false;

    return user.otpCode === pin;
  }
}
