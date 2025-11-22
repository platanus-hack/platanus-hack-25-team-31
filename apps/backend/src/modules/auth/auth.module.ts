import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../users/entities/user.entity';
import { AgentTokenGuard } from './guards/agent-token.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AuthController],
  providers: [AuthService, AgentTokenGuard],
  exports: [AgentTokenGuard],
})
export class AuthModule {}
