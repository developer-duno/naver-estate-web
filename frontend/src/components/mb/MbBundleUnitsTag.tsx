import { BUNDLE_UNITS_LABEL, isBundleUnits } from "@/lib/mb-format";

interface Props {
  apartment: { units?: number | null; bundle_units?: number | null };
  /** true = 숫자 밑 줄(표 칸·상세 막대), false = 숫자 옆(휴대폰 목록·선택 카드) — 사장님 결정 2026-10-14 */
  below?: boolean;
}

/** 세대수가 같은 단지 묶음 값일 때 숫자에 붙는 작은 이름표 (B22). 아니면 아무것도 안 그린다 */
export function MbBundleUnitsTag({ apartment, below = false }: Props) {
  if (!isBundleUnits(apartment)) return null;
  const place = below ? "block" : "ml-1";
  return <span className={`${place} text-[10px] font-normal text-gray-400`}>{BUNDLE_UNITS_LABEL}</span>;
}
