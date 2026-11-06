"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function SimpleBarChart({
  data,
  dataKey,
  label,
  color = "#10b981",
  height = 240,
  className,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  label: string;
  color?: string;
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{
              background: "#0d1729",
              border: "1px solid #1c2b45",
              borderRadius: 12,
              fontSize: 12,
              color: "#fff",
            }}
            labelStyle={{ color: "#8ea0bb", marginBottom: 4 }}
            formatter={(value) => [formatCompactCurrency(Number(value)), label]}
          />
          <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={42} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
