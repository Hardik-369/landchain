"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCompactCurrency } from "@/lib/utils";

export function AllocationDonut({
  data,
  centerLabel = "Invested",
}: {
  data: { name: string; value: number; color: string }[];
  centerLabel?: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-[190px] w-[190px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={88}
              paddingAngle={data.length > 1 ? 3 : 0}
              stroke="none"
            >
              {data.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#0d1729",
                border: "1px solid #1c2b45",
                borderRadius: 12,
                fontSize: 12,
                color: "#fff",
              }}
              formatter={(value) => formatCompactCurrency(Number(value))}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">
              {centerLabel}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {formatCompactCurrency(total)}
            </p>
          </div>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {data.length === 0 ? (
          <li className="text-sm text-ink-muted">No holdings yet.</li>
        ) : (
          data.map((item) => {
            const share = total ? Math.round((item.value / total) * 100) : 0;
            return (
              <li key={item.name} className="flex items-center gap-2.5">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="flex-1 truncate text-[13px] text-white/80">
                  {item.name}
                </span>
                <span className="text-[12px] font-medium text-white">{share}%</span>
                <span className="w-16 text-right text-[11px] text-ink-muted">
                  {formatCompactCurrency(item.value)}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
