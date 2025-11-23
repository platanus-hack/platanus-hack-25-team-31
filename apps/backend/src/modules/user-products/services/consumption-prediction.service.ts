import { Injectable, Logger } from '@nestjs/common';
import MultivariateLinearRegression from 'ml-regression-multivariate-linear';
import { InventoryMovement, MovementType } from '../../inventory-movements/entities/inventory-movement.entity';

@Injectable()
export class ConsumptionPredictionService {
  private readonly logger = new Logger(ConsumptionPredictionService.name);

  /**
   * Predice el consumo diario usando regresión lineal multivariada.
   * Considera:
   * 1. Tendencia temporal (índice de compra)
   * 2. Estacionalidad (mes del año)
   * 3. Variables externas (ej: ¿es mes festivo?)
   */
  predictDailyConsumption(movements: InventoryMovement[]): number | null {
    // Necesitamos al menos 3 puntos de datos (3 compras) para hacer una regresión mínima
    // Nota: ml-regression-multivariate-linear requiere que N (muestras) > M (variables) + 1 para ser estable
    // Aquí usaremos 3 variables (TimeIndex, Month, IsHoliday), así que idealmente necesitamos > 4 puntos.
    if (!movements || movements.length < 5) {
      return null; // Insuficientes datos, fallback a promedio simple
    }

    // Ordenar movimientos por fecha ascendente
    const sortedMovements = [...movements].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const X: number[][] = []; // Features: [TimeIndex, Month, IsHolidaySeason]
    const y: number[][] = []; // Target: [DailyConsumptionRate]

    // Construimos el dataset basado en los intervalos entre compras
    for (let i = 0; i < sortedMovements.length - 1; i++) {
      const current = sortedMovements[i];
      const next = sortedMovements[i + 1];

      // Solo miramos movimientos de entrada (compras)
      if (current.movementType !== MovementType.IN) continue;

      const daysDiff = this.getDaysDifference(current.createdAt, next.createdAt);
      if (daysDiff <= 0) continue;

      // Tasa de consumo en este intervalo = Cantidad Comprada / Días hasta la siguiente compra
      // Asumimos que se acabó justo cuando compró de nuevo
      const consumptionRate = Number(current.quantity) / daysDiff;

      // Variables (Features)
      const date = new Date(current.createdAt);
      const month = date.getMonth(); // 0-11 (Estacionalidad)
      const isHolidaySeason = month === 11 || month === 0 ? 1 : 0; // Dic/Ene (Variable externa dummy)

      // Feature 1: Índice temporal (para capturar tendencia de subida/bajada)
      // Feature 2: Mes (para capturar estacionalidad simple)
      // Feature 3: Variable externa (Festivos)
      X.push([i, month, isHolidaySeason]);
      y.push([consumptionRate]);
    }

    // Verificación adicional de tamaño de muestra post-procesamiento
    if (X.length < 5) return null;

    try {
      // Entrenamos el modelo
      const regression = new MultivariateLinearRegression(X, y);

      // Predecimos para el "siguiente" periodo
      const nextIndex = X.length;
      const nextDate = new Date();
      const nextMonth = nextDate.getMonth();
      const nextIsHoliday = nextMonth === 11 || nextMonth === 0 ? 1 : 0;

      const predictionVector = regression.predict([nextIndex, nextMonth, nextIsHoliday]);

      // La librería devuelve un array de predicciones (porque y es multidimensional)
      const predictedConsumption = predictionVector[0];

      // Validaciones de seguridad (evitar consumos negativos o absurdos)
      // Un consumo negativo es imposible física
      return Math.max(0, predictedConsumption);
    } catch (error) {
      this.logger.warn(`Error en regresión: ${error.message}`);
      return null;
    }
  }

  private getDaysDifference(date1: Date | string, date2: Date | string): number {
    const d1 = new Date(date1).getTime();
    const d2 = new Date(date2).getTime();
    return (d2 - d1) / (1000 * 3600 * 24);
  }
}
