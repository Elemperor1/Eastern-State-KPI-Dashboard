"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, EmptyState, Tabs } from "@/components/ui";
import {
  TREND_AXIS_MODE_OPTIONS,
  type TrendAxisMode,
  type TrendExplorerModel,
} from "@/features/reporting/trend-explorer";
import { CHART_COLORS, formatValue } from "@/lib/analytics";

interface TrendExplorerChartPanelProps {
  model: TrendExplorerModel;
  axisMode: TrendAxisMode;
  selectedKpiCount: number;
  selectedYearCount: number;
  selectedYears: number[];
  onAxisModeChange: (mode: TrendAxisMode) => void;
}

export function TrendExplorerChartPanel({
  model,
  axisMode,
  selectedKpiCount,
  selectedYearCount,
  selectedYears,
  onAxisModeChange,
}: TrendExplorerChartPanelProps) {
  return (
    <Card className="flex min-h-[480px] flex-col overflow-hidden">
      {model.emptyState ? (
        <EmptyState
          icon={BarChart3}
          title={model.emptyState.title}
          description={model.emptyState.description}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 lg:px-6">
            <div>
              <p className="section-eyebrow">Trend comparison</p>
              <h2 className="text-xl font-semibold text-ink-900">
                {selectedKpiCount} {selectedKpiCount === 1 ? "measure" : "measures"} across {selectedYearCount} {selectedYearCount === 1 ? "year" : "years"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-ink-500">
                Each measure uses its native scale; high-volume series can compress smaller values.
              </p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-end gap-x-4 gap-y-2">
              {model.selectedKpis.map((kpi, index) => (
                <span key={kpi.slug} className="inline-flex items-center gap-2 text-xs text-ink-600">
                  <span
                    className="size-2 rounded-sm"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    aria-hidden
                  />
                  {kpi.name}
                </span>
              ))}
            </div>
          </div>
          <div className="border-b border-ink-100 px-5 py-3 lg:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="label text-ink-700">Y-axis mode</span>
              <Tabs
                options={TREND_AXIS_MODE_OPTIONS}
                value={axisMode}
                onChange={onAxisModeChange}
              />
            </div>
          </div>
          <div className="h-[440px] px-2 pb-4 pt-5 md:h-[560px] md:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={model.trendData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--chart-axis)" }} />
                <YAxis
                  scale={axisMode === "log" ? "log" : "linear"}
                  domain={axisMode === "log" ? ["auto", "auto"] : axisMode === "indexed" ? ["auto", "auto"] : ["auto", "auto"]}
                  allowDataOverflow={axisMode === "log"}
                  tickFormatter={(value) =>
                    axisMode === "shared"
                      ? formatValue(Number(value), model.sampleUnitType, { compact: true })
                      : axisMode === "log"
                        ? `10^${Number(value).toFixed(1)}`
                        : `${Number(value).toFixed(0)}`
                  }
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                  width={70}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (value === null || value === undefined) return ["—", name];
                    if (axisMode === "shared") {
                      return [formatValue(Number(value), model.sampleUnitType), name];
                    }
                    if (axisMode === "log") {
                      return [`10^${Number(value).toFixed(2)} (≈ ${formatValue(Math.pow(10, Number(value)), model.sampleUnitType, { compact: true })})`, name];
                    }
                    return [`${Number(value).toFixed(1)} (baseline = 100)`, name];
                  }}
                />
                {model.series.map((series) => {
                  const color = CHART_COLORS[series.kpiIndex % CHART_COLORS.length];
                  return (
                    <Line
                      key={series.dataKey}
                      dataKey={series.dataKey}
                      name={series.name}
                      stroke={color}
                      strokeWidth={series.isCurrentSelection ? 2.75 : 1.75}
                      strokeOpacity={series.isCurrentSelection ? 1 : 0.62}
                      strokeDasharray={series.isCurrentSelection ? undefined : series.yearIndex % 2 === 0 ? "2 4" : "7 4"}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-ink-100 px-5 py-2 text-xs leading-5 text-ink-600">
            {model.axisModeHelp}
          </div>
          <div className="flex flex-wrap gap-4 border-t border-ink-100 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            {selectedYears.map((year, index) => {
              const isCurrentSelection = index === selectedYears.length - 1;
              return (
                <span key={year} className="inline-flex items-center gap-2">
                  <span
                    className={`block w-7 border-t-2 ${isCurrentSelection ? "border-solid border-ink-950" : index % 2 === 0 ? "border-dotted border-ink-500" : "border-dashed border-ink-500"}`}
                    aria-hidden
                  />
                  {year}
                </span>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
