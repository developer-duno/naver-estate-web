/**
 * ArticleTable 컬럼 정의 — 테이블 구조 설정 분리
 *
 * COLUMNS: 컬럼 메타데이터 (키, 라벨, 정렬 설정)
 * SERVER_SORT_MAP: 서버 정렬 키 매핑
 * getColumnValue: 행 데이터에서 컬럼 값 추출
 */
import type { Article } from "@/types";
import type { ColumnDef } from "@/components/SortableHeader";

export const COLUMNS: ColumnDef[] = [
  { key: "no", label: "No", className: "w-[40px] text-center" },
  {
    key: "trade_type",
    label: "거래",
    className: "w-[55px] text-center",
    sortable: true,
    getSortText: (a) => String((a as unknown as Article).trade_type_name || ""),
  },
  {
    key: "building",
    label: "동",
    className: "w-[60px]",
    sortable: true,
    getSortText: (a) => String((a as unknown as Article).building_name || ""),
  },
  {
    key: "floor",
    label: "층",
    className: "w-[45px] text-center",
    sortable: true,
    getSortText: (a) => String((a as unknown as Article).floor_info || ""),
  },
  {
    key: "price",
    label: "가격",
    className: "w-[120px] text-right",
    sortable: true,
    getSortValue: (a) => (a as unknown as Article).numeric_price ?? null,
  },
  {
    key: "area",
    label: "면적",
    className: "w-[120px] text-right",
    sortable: true,
    getSortValue: (a) => (a as unknown as Article).area2_m2 ?? (a as unknown as Article).area1_m2 ?? null,
  },
  {
    key: "ppyeong",
    label: "평당가",
    className: "w-[75px] text-right",
    sortable: true,
    getSortValue: (a) => (a as unknown as Article).price_per_pyeong ?? null,
  },
  {
    key: "yield",
    label: "수익률",
    headerTitle: "월세: (월세×12)/보증금, 전세: 보증금/매매중위가",
    className: "w-[70px] text-right",
    sortable: true,
    getSortValue: (a) => {
      const art = a as unknown as Article;
      return art.monthly_rent_yield ?? art.article_jeonse_ratio ?? null;
    },
  },
  {
    key: "rooms",
    label: "방/욕",
    className: "w-[45px] text-center",
    sortable: true,
    getSortValue: (a) => {
      const art = a as unknown as Article;
      return art.room_count != null ? (art.room_count * 100 + (art.bathroom_count ?? 0)) : null;
    },
  },
  {
    key: "move_in",
    label: "입주가능일",
    className: "w-[80px] text-center",
    sortable: true,
    getSortText: (a) => String((a as unknown as Article).move_in_date || ""),
  },
  {
    key: "maint",
    label: "관리비",
    className: "w-[55px] text-right",
    sortable: true,
    getSortValue: (a) => (a as unknown as Article).numeric_maintenance_cost ?? null,
  },
  {
    key: "direction",
    label: "방향",
    className: "w-[40px] text-center",
    sortable: true,
    getSortText: (a) => String((a as unknown as Article).direction || ""),
  },
  {
    key: "features",
    label: "특징",
    className: "min-w-[150px]",
  },
  {
    key: "realtor",
    label: "중개사",
    className: "w-[80px]",
    sortable: true,
    getSortText: (a) => String((a as unknown as Article).realtor_name || ""),
  },
  {
    key: "confirm_date",
    label: "확인일자",
    className: "w-[75px] text-center",
    sortable: true,
    getSortText: (a) => String((a as unknown as Article).article_confirm_ymd || ""),
  },
];

/** 서버 정렬 키 매핑 */
export const SERVER_SORT_MAP: Record<string, { asc: string; desc: string }> = {
  price: { asc: "price_asc", desc: "price_desc" },
  area: { asc: "area_asc", desc: "area_desc" },
  ppyeong: { asc: "ppyeong_asc", desc: "ppyeong_desc" },
  maint: { asc: "maintenance_asc", desc: "maintenance_desc" },
  confirm_date: { asc: "confirm_asc", desc: "confirm_desc" },
};

/** 행 데이터에서 컬럼 값 추출 (정렬용) */
export function getColumnValue(art: Article, col: ColumnDef): unknown {
  if (col.getSortValue) return col.getSortValue(art as unknown as Record<string, unknown>);
  if (col.getSortText) return col.getSortText(art as unknown as Record<string, unknown>);
  return "";
}
