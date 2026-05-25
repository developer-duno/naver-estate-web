/**
 * ArticleTable 컬럼 정의 — @tanstack/react-table v8 ColumnDef
 *
 * COLUMNS: 정렬용 메타데이터 (id, accessorFn, header, enableSorting, meta.headerTitle, meta.className)
 * SERVER_SORT_MAP: 서버 정렬 키 매핑 (FE 정렬 키 → BE sort_by 파라미터)
 *
 * 셀 렌더링은 ArticleTable.tsx 의 ArticleRow 가 담당 (옵션 B). cell: 정의 박지 말 것.
 */
import type { ColumnDef } from "@tanstack/react-table";
import type { Article } from "@/types";

export interface ArticleColumnMeta {
  headerTitle?: string;
  className?: string;
}

export const COLUMNS: ColumnDef<Article>[] = [
  { id: "no", header: "No", enableSorting: false, meta: { className: "w-[40px] text-center" } },
  {
    id: "trade_type",
    header: "거래",
    enableSorting: true,
    accessorFn: (a) => a.trade_type_name ?? "",
    meta: { className: "w-[55px] text-center" },
  },
  {
    id: "building",
    header: "동",
    enableSorting: true,
    accessorFn: (a) => a.building_name ?? "",
    meta: { className: "w-[60px]" },
  },
  {
    id: "floor",
    header: "층",
    enableSorting: true,
    accessorFn: (a) => a.floor_info ?? "",
    meta: { className: "w-[45px] text-center" },
  },
  {
    id: "price",
    header: "가격",
    enableSorting: true,
    accessorFn: (a) => a.numeric_price ?? null,
    meta: { className: "w-[120px] text-right" },
  },
  {
    id: "area",
    header: "면적",
    enableSorting: true,
    // v4 결정 2: area2_m2 ?? area1_m2 폴백 보존 (현재 동작 1:1)
    accessorFn: (a) => a.area2_m2 ?? a.area1_m2 ?? null,
    meta: { className: "w-[120px] text-right" },
  },
  {
    id: "ppyeong",
    header: "평당가",
    enableSorting: true,
    accessorFn: (a) => a.price_per_pyeong ?? null,
    meta: { className: "w-[75px] text-right" },
  },
  {
    id: "yield",
    header: "수익률",
    enableSorting: true,
    accessorFn: (a) => a.monthly_rent_yield ?? a.article_jeonse_ratio ?? null,
    meta: {
      headerTitle: "월세: (월세×12)/보증금, 전세: 보증금/매매중위가",
      className: "w-[70px] text-right",
    },
  },
  {
    id: "rooms",
    header: "방/욕",
    enableSorting: true,
    accessorFn: (a) =>
      a.room_count != null ? a.room_count * 100 + (a.bathroom_count ?? 0) : null,
    meta: { className: "w-[45px] text-center" },
  },
  {
    id: "move_in",
    header: "입주가능일",
    enableSorting: true,
    accessorFn: (a) => a.move_in_date ?? "",
    meta: { className: "w-[80px] text-center" },
  },
  {
    id: "maint",
    header: "관리비",
    enableSorting: true,
    accessorFn: (a) => a.numeric_maintenance_cost ?? null,
    meta: { className: "w-[55px] text-right" },
  },
  {
    id: "direction",
    header: "방향",
    enableSorting: true,
    accessorFn: (a) => a.direction ?? "",
    meta: { className: "w-[40px] text-center" },
  },
  {
    id: "features",
    header: "특징",
    enableSorting: false,
    meta: { className: "min-w-[150px]" },
  },
  {
    id: "realtor",
    header: "중개사",
    enableSorting: true,
    accessorFn: (a) => a.realtor_name ?? "",
    meta: { className: "w-[80px]" },
  },
  {
    id: "confirm_date",
    header: "확인일자",
    enableSorting: true,
    accessorFn: (a) => a.article_confirm_ymd ?? "",
    meta: { className: "w-[75px] text-center" },
  },
];

/** 서버 정렬 키 매핑 (FE 컬럼 id → BE sort_by 파라미터) */
export const SERVER_SORT_MAP: Record<string, { asc: string; desc: string }> = {
  price: { asc: "price_asc", desc: "price_desc" },
  area: { asc: "area_asc", desc: "area_desc" },
  ppyeong: { asc: "ppyeong_asc", desc: "ppyeong_desc" },
  maint: { asc: "maintenance_asc", desc: "maintenance_desc" },
  confirm_date: { asc: "confirm_asc", desc: "confirm_desc" },
};
