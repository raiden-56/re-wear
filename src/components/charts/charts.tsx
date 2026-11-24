"use client";

import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/*
 * Chart palette (validated with the dataviz validator against #ffffff, all-pairs, 3 slots):
 *   series-1 #1f8a5c (green) · series-2 #c96a1e (orange) · series-3 #2a78d6 (blue)
 * CVD separation sits in the 6–8 floor band, so every multi-series chart ships a legend,
 * 2px surface gaps between stacked segments, and the table view lives in Reports.
 */
export const SERIES = ["#1f8a5c", "#c96a1e", "#2a78d6"] as const;
const GRID = "#ece6da";
const AXIS = "#5d655f";

type Fmt = (v: number) => string;
export const fmtKg: Fmt = (v) => `${v.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg`;
export const fmtInr: Fmt = (v) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const compact = (v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

function Tip({ active, payload, label, format, labels }: { active?: boolean; payload?: { value: number; dataKey: string; color: string }[]; label?: string; format: Fmt; labels?: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-muted">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-charcoal"><span className="size-2 rounded-sm" style={{ background: p.color }} />{labels?.[p.dataKey] ?? p.dataKey}</span>
          <span className="num font-semibold text-charcoal">{format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const shortDate = (s: string) => (s.length === 7 ? new Date(s + "-01").toLocaleString("en-IN", { month: "short" }) : new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short" }));

/** Single-series change over time (area with crosshair tooltip). */
export function TrendArea({ data, dataKey, format, label, height = 240 }: { data: Record<string, number | string>[]; dataKey: string; format: Fmt; label: string; height?: number }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div style={{ height }} role="img" aria-label={`${label} over time`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} /><stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tickFormatter={shortDate} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={compact} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<Tip format={format} labels={{ [dataKey]: label }} />} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey={dataKey} stroke={SERIES[0]} strokeWidth={2} fill={`url(#g${id})`} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series bars over time. */
export function TrendBars({ data, dataKey, format, label, height = 240 }: { data: Record<string, number | string>[]; dataKey: string; format: Fmt; label: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`${label} by period`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tickFormatter={shortDate} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={compact} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<Tip format={format} labels={{ [dataKey]: label }} />} cursor={{ fill: "rgba(41,46,43,0.05)" }} />
          <Bar dataKey={dataKey} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Up to three series, stacked, with legend and 2px surface gaps. */
export function StackedBars({ data, series, format, height = 260 }: { data: Record<string, number | string>[]; series: { key: string; label: string }[]; format: Fmt; height?: number }) {
  const labels = Object.fromEntries(series.map((s) => [s.key, s.label]));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-muted" aria-label="Legend">
        {series.map((s, i) => <li key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SERIES[i] }} />{s.label}</li>)}
      </ul>
      <div style={{ height }} role="img" aria-label={`Stacked ${series.map((s) => s.label).join(", ")}`}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barCategoryGap="24%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tickFormatter={shortDate} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={compact} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<Tip format={format} labels={labels} />} cursor={{ fill: "rgba(41,46,43,0.05)" }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="a" fill={SERIES[i]} stroke="#ffffff" strokeWidth={2} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={40} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Ranked magnitude: horizontal bars in one hue with value labels on the top rows. */
export function RankBars({ data, nameKey, valueKey, format, height }: { data: Record<string, number | string>[]; nameKey: string; valueKey: string; format: Fmt; height?: number }) {
  const h = height ?? Math.max(160, data.length * 30 + 20);
  return (
    <div style={{ height: h }} role="img" aria-label="Ranked values">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap="28%">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey={nameKey} tick={{ fill: "#292e2b", fontSize: 12 }} axisLine={false} tickLine={false} width={130} />
          <Tooltip content={<Tip format={format} labels={{ [valueKey]: "Value" }} />} cursor={{ fill: "rgba(41,46,43,0.05)" }} />
          <Bar dataKey={valueKey} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", formatter: (v: unknown) => format(Number(v)), fill: AXIS, fontSize: 11 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
