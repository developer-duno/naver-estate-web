"use client";

import { useState, type FormEvent } from "react";
import RegionSelector from "@/components/RegionSelector";
import EstateTypeTabs from "@/components/EstateTypeTabs";
import ComplexSortDropdown from "@/components/ComplexSortDropdown";
import { ESTATE_TYPE_TABS } from "@/lib/constants";

interface Props {
  /** 주소의 검색어(`q`) — 뒤로·앞으로 가기로 주소가 바뀌면 입력칸도 다시 맞춘다 */
  query: string;
  onSubmitKeyword: (q: string) => void;
  onSearchRegion: (sido: string, sigungu: string, dong?: string) => void;
  selectedTypes: string[];
  onTypesChange: (types: string[]) => void;
  sort: string;
  onSortChange: (v: string) => void;
  /** 비로그인 확정 — 정렬에서 매물 수 기준을 뺀다(세션 491) */
  publicView: boolean;
}

type Panel = "region" | "type" | null;

const chipCls =
  "inline-flex h-10 max-w-full items-center gap-1 rounded-full border border-brand-navy-line px-3.5 text-sm font-medium text-white hover:bg-white/10";

/** 고른 매물유형 글자 — 적용 조건 칩(ActiveFilterChips)과 같은 규칙(탭 순서 · 가운뎃점으로 잇기) */
export function typeChipLabel(selected: string[]): string {
  return ESTATE_TYPE_TABS.filter((t) => selected.includes(t.code)).map((t) => t.label).join("·");
}

/**
 * 검색 결과 화면의 얇은 남색 띠(세션 525 · B40 PR 2a) — 검색창 + 칩 줄(지역으로 찾기 · 매물유형 · 정렬).
 * 홈 검색 상자(HomeSearchBox)와 같은 색·폭(max-w-[1160px])이라 홈에서 검색해도 검색창이 옆으로 안 튄다. 홈 부품은 손대지 않는다.
 * 유형·정렬 칩은 결과의 모든 상태(받는 중·결과 없음·오류)에서 누구에게나 보인다.
 */
export default function SearchBand({ query, onSubmitKeyword, onSearchRegion, selectedTypes, onTypesChange, sort, onSortChange, publicView }: Props) {
  const [value, setValue] = useState(query);
  const [prevQuery, setPrevQuery] = useState(query);
  // 주소가 바뀌면(뒤로·앞으로 가기 포함) 입력칸을 주소 글자로 다시 맞춘다 — 렌더 중 이전 값 비교
  if (query !== prevQuery) {
    setPrevQuery(query);
    setValue(query);
  }
  const [open, setOpen] = useState<Panel>(null);
  const toggle = (p: Exclude<Panel, null>) => setOpen((cur) => (cur === p ? null : p));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmitKeyword(value);
  };

  return (
    <div className="bg-brand-navy text-white" data-testid="search-band">
      <div className="mx-auto max-w-[1160px] px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
        <form role="search" onSubmit={submit} className="flex max-w-[760px] gap-2">
          <input
            type="text"
            aria-label="단지 또는 지역 검색"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="아파트 이름이나 동네를 입력하세요"
            maxLength={100}
            className="h-12 min-w-0 flex-1 rounded-xl border-0 bg-white px-4 text-base text-brand-navy placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-orange"
          />
          <button type="submit" className="h-12 shrink-0 rounded-xl bg-brand-orange px-5 text-base font-bold text-brand-navy hover:brightness-95 sm:px-7">
            검색
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" aria-expanded={open === "region"} onClick={() => toggle("region")} className={chipCls}>
            지역으로 찾기 {open === "region" ? "▴" : "▾"}
          </button>
          <button
            type="button"
            data-testid="type-chip"
            aria-expanded={open === "type"}
            aria-label={`매물유형 고르기 — 지금 ${typeChipLabel(selectedTypes)}`}
            onClick={() => toggle("type")}
            className={chipCls}
          >
            <span className="truncate">{typeChipLabel(selectedTypes)}</span>
            <span aria-hidden="true">{open === "type" ? "▴" : "▾"}</span>
          </button>
          <ComplexSortDropdown value={sort} onChange={onSortChange} publicView={publicView} tone="navy" />
        </div>
        {open === "region" && (
          <div className="mt-3 rounded-xl bg-white p-4 text-brand-navy">
            <RegionSelector
              onSearch={(s, sg, d) => {
                setOpen(null);
                onSearchRegion(s, sg, d);
              }}
            />
          </div>
        )}
        {open === "type" && (
          <div className="mt-3 rounded-xl bg-white p-3 text-brand-navy">
            <EstateTypeTabs selected={selectedTypes} onChange={onTypesChange} />
          </div>
        )}
      </div>
    </div>
  );
}
