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
import { Product } from '@/dummy-types/product';

interface StockSummaryChartProps {
  products: Product[];
}

export default function StockSummaryChart({ products }: StockSummaryChartProps) {
  const optimalDays = Number(process.env.NEXT_PUBLIC_OPTIMAL_STOCK_DAYS || 10);
  const criticalThreshold = Number(process.env.NEXT_PUBLIC_CRITICAL_STOCK_THRESHOLD || 20);
  const warningThreshold = Number(process.env.NEXT_PUBLIC_WARNING_STOCK_THRESHOLD || 40);

  const [weekOffset, setWeekOffset] = useState(0);

  // Assume today is Wednesday (Index 2) for initial render context
  // In a real app, we would get new Date().getDay() adjusted to Monday=0
  const TODAY_INDEX = 2; // Wednesday

  // Generate data for the selected week
  const chartData = useMemo(() => {
    const daysOfWeek = ['L', 'M', 'W', 'J', 'V', 'S', 'D'];
    return daysOfWeek.map((day, dayIndex) => {
      // Calculate total days passed from "today" (start of simulation)
      // If weekOffset = 0, days are 0..6
      // If weekOffset = 1, days are 7..13
      // But we need to align with "today is Wednesday".
      // Let's assume the simulation starts "now" (Wednesday of current week).
      // So Monday of current week was -2 days ago.
      // Day index relative to Monday (0..6)
      // Total days passed = (weekOffset * 7) + (dayIndex - TODAY_INDEX)

      const daysPassed = weekOffset * 7 + (dayIndex - TODAY_INDEX);

      let totalPercentage = 0;
      const count = products.length || 1;

      products.forEach((product) => {
        const optimalStock = product.dailyConsumption * optimalDays;
        // Projected stock = Current - (Daily * DaysPassed)
        // Note: If daysPassed is negative (past days), stock was higher.
        const projectedStock = product.estimatedStock - product.dailyConsumption * daysPassed;

        const finalStock = Math.max(0, projectedStock);
        const percentage = optimalStock > 0 ? (finalStock / optimalStock) * 100 : 0;
        totalPercentage += percentage;
      });

      const average = totalPercentage / count;

      return {
        name: day,
        average: Number(average.toFixed(1)),
        isPast: weekOffset === 0 && dayIndex < TODAY_INDEX,
        isFuture: weekOffset > 0 || (weekOffset === 0 && dayIndex > TODAY_INDEX),
        isToday: weekOffset === 0 && dayIndex === TODAY_INDEX,
      };
    });
  }, [products, weekOffset, optimalDays]);

  // Split data into solid (past/today) and dashed (future)
  // We need a continuous line, so we can't just split arrays easily without gaps.
  // Recharts trick: render two lines, one solid, one dashed, connected?
  // Easier approach: Stroke dasharray based on segment? Not directly supported per segment.
  // We will use two overlapping lines or custom dot logic.
  // Simpler for now: render the whole line as solid, but we want dashed for future.
  // Let's split into two data series: 'actual' and 'projected'.
  // 'actual' has values up to Today. 'projected' starts at Today.

  const processedData = chartData.map((d, i) => {
    // Week 0: Monday(0), Tuesday(1) are past. Wednesday(2) is today. Thu-Sun future.
    // Past weeks: All past.
    // Future weeks: All future.

    // Logic for simulation:
    // If weekOffset < 0: All past (Solid)
    // If weekOffset > 0: All projected (Dashed)
    // If weekOffset === 0:
    //    0..2 (Mon-Wed) -> Solid
    //    2..6 (Wed-Sun) -> Dashed (overlap at Wed to connect lines)

    let solidVal = null;
    let dashedVal = null;

    if (weekOffset < 0) {
      solidVal = d.average;
    } else if (weekOffset > 0) {
      dashedVal = d.average;
    } else {
      // Current week
      if (i <= TODAY_INDEX) solidVal = d.average;
      if (i >= TODAY_INDEX) dashedVal = d.average;
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
            <LineChart data={processedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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

              {/* Solid Line (Past/Present) */}
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

              {/* Dashed Line (Future) */}
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
