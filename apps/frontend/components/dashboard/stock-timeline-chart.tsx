'use client';

const DAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const TODAY_INDEX = 4; // Fixed to Thursday

export type ChartPoint = {
  dayIndex: number;
  dayLetter: (typeof DAYS)[number];
  average: number;
  solidVal: number | null;
  dashedVal: number | null;
};

interface StockTimelineChartProps {
  data: ChartPoint[];
  weekOffset: number;
  yAxisMax: number;
  warningThreshold: number;
  criticalThreshold: number;
  label: string;
}

export function StockTimelineChart({
  data,
  weekOffset,
  yAxisMax,
  warningThreshold,
  criticalThreshold,
  label,
}: StockTimelineChartProps) {
  // Helper to convert value to Y percentage (0=Top, 100=Bottom)
  const getY = (val: number) => {
    const percentage = (val / yAxisMax) * 100;
    // Clamp to ensure within bounds visually
    return 100 - Math.max(0, Math.min(100, percentage));
  };

  // Helper to convert index to X percentage (0..100)
  const getX = (index: number) => (index / 7) * 100;

  // Generate Points for Polylines "x,y x,y"
  const solidPoints = data
    .filter((d) => d.solidVal !== null)
    .map((d) => `${getX(d.dayIndex)},${getY(d.solidVal as number)}`)
    .join(' ');

  const dashedPoints = data
    .filter((d) => d.dashedVal !== null)
    .map((d) => `${getX(d.dayIndex)},${getY(d.dashedVal as number)}`)
    .join(' ');

  // Areas Calculation (Percentage heights)
  const criticalHeight = (criticalThreshold / yAxisMax) * 100;
  const warningHeight = ((warningThreshold - criticalThreshold) / yAxisMax) * 100;

  // Y positions (from top 0 to bottom 100)
  const criticalY = 100 - criticalHeight;
  const warningY = criticalY - warningHeight;

  return (
    <div className="h-full w-full select-none relative overflow-hidden rounded-sm">
      {/* Label inside chart */}
      <div className="absolute top-2 left-4 z-20 pointer-events-none">
        <span className="text-sm font-semibold text-muted-foreground bg-background/30 px-1 rounded">{label}</span>
      </div>

      {/* SVG Layer for Lines, Grid, Areas */}
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 z-0">
        {/* Background Areas */}
        <rect x="0" y={criticalY} width="100" height={criticalHeight} fill="red" fillOpacity={0.05} />
        <rect x="0" y={warningY} width="100" height={warningHeight} fill="orange" fillOpacity={0.05} />
        <rect x="0" y="0" width="100" height={warningY} fill="green" fillOpacity={0.05} />

        {/* Grid Lines (Vertical) */}
        {DAYS.map((_, i) => (
          <line
            key={`grid-${i}`}
            x1={getX(i)}
            y1="0"
            x2={getX(i)}
            y2="100"
            stroke="#e5e7eb" // gray-200
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="3 3"
          />
        ))}

        {/* Reference Lines (Horizontal) */}
        <line
          x1="0"
          y1={criticalY}
          x2="100"
          y2={criticalY}
          stroke="#000"
          strokeOpacity={0.2}
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          y1={warningY}
          x2="100"
          y2={warningY}
          stroke="#000"
          strokeOpacity={0.2}
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />

        {/* Today Line (Vertical) */}
        {weekOffset === 0 && (
          <line
            x1={getX(TODAY_INDEX)}
            y1="0"
            x2={getX(TODAY_INDEX)}
            y2="100"
            stroke="#000"
            strokeOpacity={0.5}
            strokeWidth="1"
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Solid Line (Blue) */}
        <polyline
          points={solidPoints}
          fill="none"
          stroke="blue"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dashed Line (Black) */}
        <polyline
          points={dashedPoints}
          fill="none"
          stroke="black"
          strokeWidth="2"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* HTML Layer for Dots (Prevents distortion) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {data.map((d, i) => {
          if (d.solidVal === null && d.dashedVal === null) return null;
          const val = d.solidVal ?? d.dashedVal ?? 0;
          const top = getY(val);
          const left = getX(i);
          const isSolid = d.solidVal !== null;
          const bgColor = isSolid ? 'bg-blue-600' : 'bg-black';

          return (
            <div
              key={i}
              className={`absolute w-2 h-2 rounded-full -ml-1 -mt-1 ${bgColor}`}
              style={{ left: `${left}%`, top: `${top}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
