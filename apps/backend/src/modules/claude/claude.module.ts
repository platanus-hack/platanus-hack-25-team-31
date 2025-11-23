import { Module, forwardRef } from '@nestjs/common';
import { ClaudeService } from './claude.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [forwardRef(() => ProductsModule)],
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
