'use client';

import { useMemo, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';

import { StockTimelineChart, ChartPoint } from './stock-timeline-chart';

const DAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const TODAY_INDEX = 4; // 0..6 (domingo..sábado)

export interface UserProduct {
  id: string;
  dailyConsumption: number | string;
  estimatedStock: number | string;
}

export interface Movement {
  id: string;
  userProductId: string;
  createdAt: string | Date;
  stockAfter: number | string;
}

interface StockTimelineSectionProps {
  products: UserProduct[];
  movements: Movement[];
}

interface OptimizedMovement {
  stockAfter: number;
  timestamp: number;
}

function generateWeekData(
  offset: number,
  products: UserProduct[],
  movementsMap: Map<string, OptimizedMovement[]>,
  optimalDays: number,
): ChartPoint[] {
  const rawData = DAYS.map((dayLetter, dayIndex) => {
    const daysPassed = offset * 7 + (dayIndex - TODAY_INDEX);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysPassed);
    targetDate.setHours(23, 59, 59, 999);
    const targetTime = targetDate.getTime();

    let totalPercentage = 0;
    const count = products.length || 1;

    products.forEach((userProduct) => {
      const dailyConsumption = Number(userProduct.dailyConsumption);
      const optimalStock = dailyConsumption * optimalDays;
      let stockAtDate = 0;

      if (daysPassed <= 0) {
        const list = movementsMap.get(userProduct.id);
        if (list) {
          for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].timestamp <= targetTime) {
              stockAtDate = list[i].stockAfter;
              break;
            }
          }
        }
      } else {
        const currentStock = Number(userProduct.estimatedStock);
        const projectedStock = currentStock - dailyConsumption * daysPassed;
        stockAtDate = Math.max(0, projectedStock);
      }

      const percentage = optimalStock > 0 ? (stockAtDate / optimalStock) * 100 : 0;
      totalPercentage += percentage;
    });

    const average = totalPercentage / count;

    return {
      dayIndex,
      dayLetter,
      average: Number(average.toFixed(1)),
      isPast: offset === 0 && dayIndex < TODAY_INDEX,
      isFuture: offset > 0 || (offset === 0 && dayIndex > TODAY_INDEX),
      isToday: offset === 0 && dayIndex === TODAY_INDEX,
    };
  });

  return rawData.map((d) => {
    let solidVal: number | null = null;
    let dashedVal: number | null = null;

    if (offset < 0) {
      solidVal = d.average;
    } else if (offset > 0) {
      dashedVal = d.average;
    } else {
      if (d.isPast || d.isToday) solidVal = d.average;
      if (d.isFuture || d.isToday) dashedVal = d.average;
    }

    return { ...d, solidVal, dashedVal };
  });
}

export function StockTimelineSection({ products, movements }: StockTimelineSectionProps) {
  const [api, setApi] = useState<CarouselApi>();

  const optimalDays = Number(process.env.NEXT_PUBLIC_OPTIMAL_STOCK_DAYS || 10);
  const criticalThreshold = Number(process.env.NEXT_PUBLIC_CRITICAL_STOCK_THRESHOLD || 20);
  const warningThreshold = Number(process.env.NEXT_PUBLIC_WARNING_STOCK_THRESHOLD || 40);

  // Configuration: How many weeks back/forward to render
  const HISTORY_WEEKS = 24;
  const FUTURE_WEEKS = 12;

  // Generate static list of offsets: [-24, -23, ... 0, ... 12]
  const offsets = useMemo(() => {
    const arr = [];
    for (let i = -HISTORY_WEEKS; i <= FUTURE_WEEKS; i++) arr.push(i);
    return arr;
  }, []);

  const movementsByProduct = useMemo(() => {
    const map = new Map<string, OptimizedMovement[]>();
    movements.forEach((m) => {
      if (!map.has(m.userProductId)) map.set(m.userProductId, []);
      const list = map.get(m.userProductId);
      if (list) {
        list.push({
          stockAfter: Number(m.stockAfter),
          timestamp: new Date(m.createdAt).getTime(),
        });
      }
    });
    map.forEach((list) => list.sort((a, b) => a.timestamp - b.timestamp));
    return map;
  }, [movements]);

  const chartDataCache = useMemo(() => {
    const cache: Record<number, ChartPoint[]> = {};
    // Calculate data for ALL rendered offsets at once
    offsets.forEach((offset) => {
      cache[offset] = generateWeekData(offset, products, movementsByProduct, optimalDays);
    });
    return cache;
  }, [products, movementsByProduct, optimalDays, offsets]);

  const handleBackToToday = useCallback(() => {
    if (!api) return;
    api.scrollTo(HISTORY_WEEKS);
  }, [api]);

  const yAxisMax = useMemo(() => {
    let maxAvg = 0;
    // Scan ALL rendered weeks to ensure consistent scale
    offsets.forEach((offset) => {
      const data = chartDataCache[offset];
      if (data) {
        const maxInWeek = Math.max(...data.map((d) => d.average));
        if (maxInWeek > maxAvg) maxAvg = maxInWeek;
      }
    });
    return maxAvg > 100 ? maxAvg * 1.2 : 100;
  }, [chartDataCache, offsets]);

  const yTicks = useMemo(() => {
    const baseMax = Math.max(yAxisMax, 100);
    const step = baseMax / 4;
    return [0, step, step * 2, step * 3, baseMax];
  }, [yAxisMax]);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Promedio historico de productos</CardTitle>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => api?.scrollPrev()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => api?.scrollNext()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="relative h-72 w-full select-none">
          <div className="absolute left-0 top-0 bottom-20 w-10 flex flex-col justify-between text-xs text-muted-foreground z-10 bg-background/50 pr-2">
            {yTicks
              .slice()
              .reverse()
              .map((tick) => (
                <span key={tick} className="leading-none text-right">
                  {Math.round(tick)}%
                </span>
              ))}
          </div>

          <div className="absolute left-10 right-0 top-0 bottom-20 overflow-hidden">
            <Carousel
              setApi={setApi}
              opts={{ startIndex: HISTORY_WEEKS, loop: false, watchDrag: true }}
              className="w-full h-full"
            >
              <CarouselContent className="-ml-0 h-full">
                {offsets.map((offset) => {
                  const data = chartDataCache[offset];
                  return (
                    <CarouselItem key={offset} className="pl-0 h-full">
                      <StockTimelineChart
                        data={data}
                        weekOffset={offset}
                        yAxisMax={yAxisMax}
                        warningThreshold={warningThreshold}
                        criticalThreshold={criticalThreshold}
                        label={
                          offset === 0
                            ? 'Esta semana'
                            : offset > 0
                              ? `En ${offset} sem`
                              : `Hace ${Math.abs(offset)} sem`
                        }
                      />
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
            </Carousel>
          </div>

          <div className="absolute bottom-0 left-0 right-0 flex justify-center">
            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={handleBackToToday}>
              Ir a semana actual
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
