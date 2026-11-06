"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactCurrency } from "@/lib/utils";

export function PortfolioPerformance({
  data,
}: {
  data: { month: string; invested: number; value: number }[];
}) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="investedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.16} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1c2b45" strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "#8ea0bb", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            dy={8}
          />
          <YAxis
            tick={{ fill: "#8ea0bb", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => formatCompactCurrency(value)}
            width={68}
          />
          <Tooltip
            contentStyle={{
              background: "#0d1729",
              border: "1px solid #1c2b45",
              borderRadius: 12,
              fontSize: 12,
              color: "#fff",
            }}
            labelStyle={{ color: "#8ea0bb", marginBottom: 4 }}
            formatter={(value) => formatCompactCurrency(Number(value))}
          />
          <Area
            type="monotone"
            dataKey="value"
            name="Portfolio value"
            stroke="#10b981"
            strokeWidth={2.2}
            fill="url(#valueFill)"
          />
          <Area
            type="monotone"
            dataKey="invested"
            name="Invested"
            stroke="#38bdf8"
            strokeWidth={1.8}
            strokeDasharray="4 4"
            fill="url(#investedFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
