import type { DataFreshnessItem } from "@/types/admin";

export interface Counts {
  green: number;
  yellow: number;
  red: number;
  unknown: number;
  spinning: number;
}

export function tally(items: DataFreshnessItem[]): Counts {
  const c: Counts = { green: 0, yellow: 0, red: 0, unknown: 0, spinning: 0 };
  for (const it of items) {
    c[it.status] += 1;
    if (it.spinning) c.spinning += 1;
  }
  return c;
}

const PRIORITY = { red: 4, yellow: 3, green: 2, unknown: 1 } as const;

export function worstStatus(items: DataFreshnessItem[] | undefined): string {
  if (!items?.length) return "unknown";
  return items.reduce<string>((worst, it) => {
    const p = PRIORITY[it.status] ?? 0;
    const wp = PRIORITY[worst as keyof typeof PRIORITY] ?? 0;
    return p > wp ? it.status : worst;
  }, "unknown");
}

export function deriveHealthStatus(items: DataFreshnessItem[] | undefined): string {
  if (!items?.length) return "unknown";
  const c = tally(items);
  if (c.spinning > 0 || c.red > 0) return "red";
  if (c.yellow > 0) return "yellow";
  if (c.green > 0) return "green";
  return "unknown";
}
