"use client";

import { MetricBar } from "./MetricBar";
import { metricBarConfigs } from "./metric-bar-configs";

interface Props {
  value: number | null | undefined;
}

export function MbSchoolWalkBar({ value }: Props) {
  return <MetricBar value={value} config={metricBarConfigs.schoolWalk} />;
}
