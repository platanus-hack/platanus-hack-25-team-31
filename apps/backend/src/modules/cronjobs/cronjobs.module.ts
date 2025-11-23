import { Module } from '@nestjs/common';
import { CronjobsService } from './cronjobs.service';
import { UserProductsModule } from '../user-products/user-products.module';

@Module({
  imports: [UserProductsModule],
  providers: [CronjobsService],
})
export class CronjobsModule {}

