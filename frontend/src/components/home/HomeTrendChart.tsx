"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartMonth, formatKoreanPrice } from "@/lib/format";

/** 세로축 짧은 단위(만원 → "21.3억"·"8,500만") — 「21억3,000만」은 축 칸에서 왼쪽이 잘렸다(세션 508 보완) */
export function axisEok(manwon: number): string {
  if (!Number.isFinite(manwon)) return "";
  if (Math.abs(manwon) < 10_000) return `${Math.round(manwon).toLocaleString()}만`;
  return `${(manwon / 10_000).toFixed(1).replace(/\.0$/, "")}억`;
}

/**
 * 홈 「지역 시세 흐름」 꺾은선(세션 508) — 남색 카드 위에 그린다. 부모가 dynamic(ssr:false)로 불러온다.
 * 값 = 한국부동산원 시군구 중위 매매가(만원). 지역 공식 통계라 중위값을 그대로 보인다(feedback_no_median 예외).
 */
export default function HomeTrendChart({ points }: { points: { period: string; value: number }[] }) {
  const data = points.map((p) => ({ month: formatChartMonth(p.period), value: p.value }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="month"
          tick={{ fill: "var(--color-brand-on-navy-muted)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-brand-navy-line)" }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: "var(--color-brand-on-navy-muted)", fontSize: 11 }}
          tickFormatter={axisEok}
          tickLine={false}
          axisLine={false}
          width={52}
          tickCount={5}
          domain={["auto", "auto"]}
        />
        <Tooltip
          formatter={(v) => [formatKoreanPrice(Number(v)), "중위 매매가"]}
          labelStyle={{ color: "var(--color-brand-navy)" }}
        />
        <Line type="monotone" dataKey="value" stroke="var(--color-brand-orange)" strokeWidth={3} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
