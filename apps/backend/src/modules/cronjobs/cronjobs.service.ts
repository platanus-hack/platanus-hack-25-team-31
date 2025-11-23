import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserProductsService } from '../user-products/user-products.service';

@Injectable()
export class CronjobsService {
  private readonly logger = new Logger(CronjobsService.name);

  constructor(private readonly userProductsService: UserProductsService) {}

  /**
   * Cronjob que se ejecuta todos los días a las 00:01
   * Reduce el stock diario de todos los productos según su consumo diario
   * Formato cron: segundo minuto hora día mes día-semana
   * '1 0 * * *' = minuto 1, hora 0 (medianoche), todos los días
   */
  @Cron('1 0 * * *')
  async handleDailyStockReduction() {
    this.logger.log('Iniciando reducción diaria de stock (cronjob diario a las 00:01)');
    try {
      const result = await this.userProductsService.reduceDailyStock();
      this.logger.log(
        `Reducción diaria de stock completada: ${result.productsUpdated} productos actualizados, ${result.movementsCreated} movimientos creados`,
      );
    } catch (error) {
      this.logger.error(`Error en reducción diaria de stock: ${error.message}`, error.stack);
    }
  }

  /**
   * Cronjob que se ejecuta todos los días a las 09:00
   * Revisa stocks críticos y notifica a los usuarios
   */
  @Cron('0 9 * * *')
  async handleCriticalStockCheck() {
    this.logger.log('Iniciando chequeo diario de stock crítico (cronjob diario a las 09:00)');
    try {
      await this.userProductsService.checkAndNotifyCriticalStock();
    } catch (error) {
      this.logger.error(`Error en chequeo de stock crítico: ${error.message}`, error.stack);
    }
  }

  /**
   * Cronjob que se ejecuta todos los días a las 02:00
   * Ajusta el consumo diario de los productos basándose en el historial de compras
   */
  @Cron('0 2 * * *')
  async handleDailyConsumptionAdjustment() {
    this.logger.log('Iniciando ajuste de consumo diario (cronjob diario a las 02:00)');
    try {
      const result = await this.userProductsService.recalculateDailyConsumption();
      this.logger.log(
        `Ajuste completado. Procesados: ${result.processed}, Actualizados: ${result.updated}, Tier1(Skip): ${result.tier1Skipped}, Tier2(Avg): ${result.tier2Calculated}, Tier3(ML): ${result.tier3Calculated}`,
      );
    } catch (error) {
      this.logger.error(`Error en ajuste de consumo diario: ${error.message}`, error.stack);
    }
  }
}
