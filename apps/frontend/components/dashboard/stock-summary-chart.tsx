'use client';

import { useState, useMemo } from 'react';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { UserProduct } from '@backend/src/modules/user-products/entities/user-product.entity';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { InventoryMovement } from '@backend/src/modules/inventory-movements/entities/inventory-movement.entity';

interface StockSummaryChartProps {
  products: UserProduct[];
  movements?: InventoryMovement[];
}

export default function StockSummaryChart({ products, movements = [] }: StockSummaryChartProps) {
  const optimalDays = Number(process.env.NEXT_PUBLIC_OPTIMAL_STOCK_DAYS || 10);
  const criticalThreshold = Number(process.env.NEXT_PUBLIC_CRITICAL_STOCK_THRESHOLD || 20);
  const warningThreshold = Number(process.env.NEXT_PUBLIC_WARNING_STOCK_THRESHOLD || 40);

  const [weekOffset, setWeekOffset] = useState(0);

  const TODAY_INDEX = 3; // Thursday (Centered)

  // Generate data for the selected week
  const chartData = useMemo(() => {
    const daysOfWeek = ['L', 'M', 'X', 'J', 'V', 'S', 'D']; // Values ignored for display

    return daysOfWeek.map((_, dayIndex) => {
      const daysPassed = weekOffset * 7 + (dayIndex - TODAY_INDEX);

      // Label Logic
      let displayName = '';
      if (weekOffset === 0) {
        if (daysPassed === 0) displayName = 'Hoy';
        else if (daysPassed === -1) displayName = 'Ayer';
        else if (daysPassed === 1) displayName = 'Mañana';
      }

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysPassed);
      targetDate.setHours(23, 59, 59, 999); // End of day

      let totalPercentage = 0;
      const count = products.length || 1;

      products.forEach((userProduct) => {
        const dailyConsumption = Number(userProduct.dailyConsumption);
        const optimalStock = dailyConsumption * optimalDays;
        let stockAtDate = 0;

        if (daysPassed <= 0) {
          // PAST/PRESENT: Use History
          const productMovements = movements
            .filter(
              (m) => m.userProductId === userProduct.id && new Date(m.createdAt).getTime() <= targetDate.getTime(),
            )
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          if (productMovements.length > 0) {
            stockAtDate = Number(productMovements[0].stockAfter);
          } else {
            stockAtDate = 0;
          }
        } else {
          // FUTURE: Use Projection
          const currentStock = Number(userProduct.estimatedStock);
          const projectedStock = currentStock - dailyConsumption * daysPassed;
          stockAtDate = Math.max(0, projectedStock);
        }

        const percentage = optimalStock > 0 ? (stockAtDate / optimalStock) * 100 : 0;
        totalPercentage += percentage;
      });

      const average = totalPercentage / count;

      return {
        name: displayName,
        average: Number(average.toFixed(1)),
        isPast: weekOffset === 0 && dayIndex < TODAY_INDEX,
        isFuture: weekOffset > 0 || (weekOffset === 0 && dayIndex > TODAY_INDEX),
        isToday: weekOffset === 0 && dayIndex === TODAY_INDEX,
      };
    });
  }, [products, movements, weekOffset, optimalDays]);

  const processedData = chartData.map((d) => {
    let solidVal = null;
    let dashedVal = null;

    if (weekOffset < 0) {
      // Past weeks: All solid (History)
      solidVal = d.average;
    } else if (weekOffset > 0) {
      // Future weeks: All dashed (Projection)
      dashedVal = d.average;
    } else {
      // Current week
      if (d.isPast || d.isToday) {
        solidVal = d.average;
      }
      if (d.isFuture || d.isToday) {
        // Start dashed from Today to connect lines
        dashedVal = d.average;
      }
    }

    return { ...d, solidVal, dashedVal };
  });

  // Calculate dynamic max for the chart Y-axis
  const maxDataValue = Math.max(...chartData.map((d) => d.average));
  const yAxisMax = maxDataValue > 100 ? maxDataValue * 1.2 : 100;

  const currentWeekLabel =
    weekOffset === 0
      ? 'Esta semana'
      : weekOffset > 0
        ? `En ${weekOffset} semana(s)`
        : `Hace ${Math.abs(weekOffset)} semana(s)`;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">Stock ({currentWeekLabel})</CardTitle>
        <div className="flex items-center space-x-1">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(weekOffset - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(weekOffset + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={processedData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="#e5e7eb" opacity={0.9} />
              <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} interval={0} />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${Math.round(value)}%`}
                domain={[0, yAxisMax]}
              />

              {/* Background zones */}
              <ReferenceArea y1={0} y2={criticalThreshold} fill="red" fillOpacity={0.05} />
              <ReferenceArea y1={criticalThreshold} y2={warningThreshold} fill="orange" fillOpacity={0.05} />
              <ReferenceArea y1={warningThreshold} y2={yAxisMax} fill="green" fillOpacity={0.05} />

              {/* Threshold lines */}
              <ReferenceLine
                y={criticalThreshold}
                stroke="red"
                strokeDasharray="3 3"
                label={{ position: 'insideRight', fill: 'red', fontSize: 10 }}
              />
              <ReferenceLine
                y={warningThreshold}
                stroke="orange"
                strokeDasharray="3 3"
                label={{ position: 'insideRight', fill: 'orange', fontSize: 10 }}
              />

              {/* Solid Line (Past/Present - Real Data) */}
              <Line
                type="monotone"
                dataKey="solidVal"
                name="Promedio (Real)"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
                animationDuration={200}
              />

              {/* Dashed Line (Future - Projected) */}
              <Line
                type="monotone"
                dataKey="dashedVal"
                name="Promedio (Proyectado)"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
                connectNulls
                animationDuration={200}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
