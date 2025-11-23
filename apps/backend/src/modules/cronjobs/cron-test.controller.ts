import { Controller, Post } from '@nestjs/common';
import { CronjobsService } from './cronjobs.service';

@Controller('cron-test')
export class CronTestController {
  constructor(private readonly cronjobsService: CronjobsService) {}

  @Post('trigger-daily-consumption')
  async triggerDailyConsumption() {
    await this.cronjobsService.handleDailyConsumptionAdjustment();
    return { message: 'Daily consumption adjustment triggered' };
  }
}

