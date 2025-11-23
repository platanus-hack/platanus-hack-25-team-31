import { Module } from '@nestjs/common';
import { CronjobsService } from './cronjobs.service';
import { UserProductsModule } from '../user-products/user-products.module';
import { CronTestController } from './cron-test.controller';

@Module({
  imports: [UserProductsModule],
  controllers: [CronTestController],
  providers: [CronjobsService],
})
export class CronjobsModule {}
