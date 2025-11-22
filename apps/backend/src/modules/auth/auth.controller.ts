import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('get-pin')
  async getPin(@Body('phone') phone: string) {
    if (!phone) throw new BadRequestException('Phone required');
    const pin = await this.authService.generatePin(phone);
    return { pin };
  }

  @Post('validate-pin')
  async validatePin(@Body('userId') userId: string, @Body('pin') pin: string) {
    if (!userId || !pin) throw new BadRequestException('UserId and Pin required');
    const valid = await this.authService.validatePin(userId, pin);
    return { valid };
  }
}
