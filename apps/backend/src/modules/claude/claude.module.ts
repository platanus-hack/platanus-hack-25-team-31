import { Module } from '@nestjs/common';
import { ClaudeService } from './claude.service';

@Module({
  imports: [],
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
