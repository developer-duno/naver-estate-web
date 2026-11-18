"use client";

import { useState } from "react";
import type { ArticleFilters, Complex } from "@/types";
import type { CompareItem } from "@/hooks/useCompare";
import { ComplexRow } from "@/components/search/ComplexRow";
import { ComplexCardMobile } from "@/components/search/ComplexCardMobile";

/** 한 번에 보여 주는 단지 수(세션 525 · B40 PR 2a) — 「더 보기」를 누를 때마다 이만큼 더 */
export const SEARCH_PAGE_SIZE = 20;
/** 펼친 수를 검색 주소별로 두는 세션 저장소 열쇠 — 단지 장에 갔다 뒤로 와도 펼친 만큼 되살린다 */
export const SEARCH_SHOWN_STORE = "search_shown_v1";
const STORE_MAX_KEYS = 20;

function readShown(listKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const map = JSON.parse(sessionStorage.getItem(SEARCH_SHOWN_STORE) ?? "{}") as Record<string, unknown>;
    const n = map[listKey];
    return typeof n === "number" && n > SEARCH_PAGE_SIZE ? n : null;
  } catch {
    return null;
  }
}

function writeShown(listKey: string, n: number) {
  try {
    const map = JSON.parse(sessionStorage.getItem(SEARCH_SHOWN_STORE) ?? "{}") as Record<string, number>;
    delete map[listKey];
    map[listKey] = n;
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.max(0, keys.length - STORE_MAX_KEYS))) delete map[k];
    sessionStorage.setItem(SEARCH_SHOWN_STORE, JSON.stringify(map));
  } catch {
    /* 저장소를 못 쓰면 되살리기만 안 된다 */
  }
}

interface Props {
  /** 거르고 정렬한 단지 전부 — 지도 보기는 이 목록 전부를 쓰고, 여기서는 앞에서부터 잘라 보여 준다 */
  complexes: Complex[];
  /** 검색어·지역·유형·정렬을 담은 목록 이름 — 바뀌면 처음 20곳으로, 같은 이름으로 돌아오면 펼친 수를 되살린다 */
  listKey: string;
  /** 지도 보기 중 — 목록은 붙여 둔 채 숨긴다(세션 351: 큰 목록 해체가 지도 전환 INP 의 진범) */
  hidden: boolean;
  urlFilters?: ArticleFilters;
  isInCompare: (no: string) => boolean;
  compareFull: boolean;
  onToggleCompare: (item: CompareItem) => void;
}

const thCls = "px-3 py-2.5 text-xs font-bold text-brand-muted whitespace-nowrap border-r border-brand-line-soft";

/**
 * 검색 결과 목록(세션 525 · B40 PR 2a) — 데스크톱 표 + 휴대폰 카드 + 「더 보기 · n / N」.
 * 매물수 칸은 자료에 매물 수가 하나라도 있을 때만(비로그인은 BE 가 걷어내 칸째 없다 — 빈 「-」 칸을 그리지 않는다).
 */
export default function SearchResults({ complexes, listKey, hidden, urlFilters, isInCompare, compareFull, onToggleCompare }: Props) {
  const [shown, setShown] = useState(() => ({ key: listKey, n: readShown(listKey) ?? SEARCH_PAGE_SIZE }));
  // 검색어·지역·유형·정렬이 바뀌면 그 목록의 펼친 수(없으면 20)로 — 렌더 중 이전 값 비교
  if (shown.key !== listKey) setShown({ key: listKey, n: readShown(listKey) ?? SEARCH_PAGE_SIZE });

  const total = complexes.length;
  const count = Math.min(shown.n, total);
  const visible = complexes.slice(0, count);
  const showArticles = complexes.some((c) => c.article_count !== undefined);

  const more = () => {
    const n = Math.min(count + SEARCH_PAGE_SIZE, total);
    setShown({ key: listKey, n });
    writeShown(listKey, n);
  };

  return (
    <>
      {/* 단지 표(데스크톱) — 표 그대로(👤 11-18 결정 4), 색·틀만 새로 */}
      <div className={hidden ? "hidden" : "hidden md:block overflow-x-auto rounded-2xl border border-brand-line-soft bg-white"}>
        <table className="w-full text-sm border-collapse">
          <thead className="bg-brand-bg border-b border-brand-line sticky top-0 z-10">
            <tr>
              <th className={`${thCls} w-[45px] text-center`}>No</th>
              <th className={`${thCls} min-w-35 text-left`}>단지명</th>
              <th className={`${thCls} min-w-50 text-left`}>주소</th>
              <th className={`${thCls} w-17.5 text-right`}>세대수</th>
              <th className={`${thCls} w-[55px] text-right`}>동수</th>
              <th className={`${thCls} w-15 text-right`}>최고층</th>
              <th className={`${thCls} w-15 text-center`}>준공</th>
              <th className={`${thCls} w-[65px] text-center`}>유형</th>
              {showArticles && <th className={`${thCls} w-[65px] text-right`}>매물수</th>}
              <th className="px-2 py-2.5 text-xs font-bold text-brand-muted whitespace-nowrap w-10 text-center" title="최대 4개 단지를 비교할 수 있습니다">비교</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((cpx, idx) => (
              <ComplexRow
                key={cpx.complex_no}
                complex={cpx}
                index={idx + 1}
                urlFilters={urlFilters}
                showArticleCount={showArticles}
                isCompared={isInCompare(cpx.complex_no)}
                compareFull={compareFull}
                onToggleCompare={onToggleCompare}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 단지 카드(휴대폰) — 표와 같은 수 */}
      <div className={hidden ? "hidden" : "md:hidden space-y-3"}>
        {visible.map((cpx) => (
          <ComplexCardMobile
            key={cpx.complex_no}
            complex={cpx}
            urlFilters={urlFilters}
            isCompared={isInCompare(cpx.complex_no)}
            compareFull={compareFull}
            onToggleCompare={onToggleCompare}
          />
        ))}
      </div>

      {count < total && (
        <button
          type="button"
          onClick={more}
          className={`${hidden ? "hidden" : "flex"} mt-4 min-h-12 w-full items-center justify-center rounded-xl border border-brand-line bg-white text-[15px] font-bold text-brand-navy hover:bg-brand-bg`}
        >
          {`더 보기 · ${count} / ${total}`}
        </button>
      )}
    </>
  );
}
