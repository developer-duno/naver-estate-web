"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchComplexesDb, getOfficialPrices } from "@/lib/api/complex";
import { queryKeys } from "@/lib/query-keys";
import { DEBOUNCE_MS, M2_TO_PYEONG } from "@/lib/constants";
import { useFavorites } from "@/hooks/useFavorites";
import { useCompare } from "@/hooks/useCompare";

interface Props {
  /** 지분율(%) — 0 이면 미입력. 0 초과면 "호 전체 공시가" 경고 캡션 노출 (지분 이중곱 방지 안내) */
  ownershipPercent: number;
  /** 현재 공시가격 입력값(만원) — 자동 채운 값과 달라지면 출처 캡션을 자동 해제 */
  publishedManwon: number;
  /** 공시가격(만원) 채움 콜백 */
  onFill: (publishedManwon: number) => void;
}

/** 후보 단지 (즐겨찾기·비교·검색 결과 공통 최소 형태) */
interface PickCandidate {
  complex_no: string;
  complex_name: string;
}

const SELECT_CLASS = "text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 min-h-[44px]";

/** m² → 평 표기 (소수 1자리) */
function toPyeongLabel(m2: number): string {
  return (Math.round((m2 / M2_TO_PYEONG) * 10) / 10).toString();
}

/**
 * 보유세 계산기 공시가격 자동입력 (PR-C)
 *
 * 흐름: 단지 선택(즐겨찾기/비교 후보 + DB 검색) → 평형 선택 → 공시가격 자동 채움.
 *
 * 🔴 지분 이중곱 금지 — property-tax.ts:115 엔진이 이미 publishedPriceWon * ownershipRatio 를
 * 계산하므로, 여기서는 price_median(호 전체)을 그대로 넘긴다. 지분율을 또 곱하면 제곱 축소 결함.
 * ownershipPercent > 0 이면 "호 전체 공시가" 경고 캡션만 띄운다.
 */
export default function PropertyTaxComplexPicker({ ownershipPercent, publishedManwon, onFill }: Props) {
  const { favorites } = useFavorites();
  const { list: compareList } = useCompare();

  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [selectedNo, setSelectedNo] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  /** 자동 채움 결과 — 사용자가 입력란을 수동 수정해 manwon 이 달라지면 캡션이 자동 해제된다 */
  const [filled, setFilled] = useState<{ manwon: number; year: string | null } | null>(null);
  /** 캡션 노출 조건: 자동 채운 값이 현재 입력값과 그대로 일치할 때만 */
  const filledDone = filled !== null && filled.manwon === publishedManwon;

  // 즐겨찾기 + 비교 목록 = 초기 후보 (두 훅 모두 complex_no/complex_name 보유, complex_no 로 중복 제거)
  const candidates = useMemo<PickCandidate[]>(() => {
    const merged = [
      ...favorites.map((f) => ({ complex_no: f.complex_no, complex_name: f.complex_name })),
      ...compareList.map((c) => ({ complex_no: c.complex_no, complex_name: c.complex_name })),
    ];
    const seen = new Set<string>();
    return merged.filter((c) => {
      if (seen.has(c.complex_no)) return false;
      seen.add(c.complex_no);
      return true;
    });
  }, [favorites, compareList]);

  // 검색어 debounce (네이버 실시간 검색 부하 완화 — 프로젝트 공용 DEBOUNCE_MS)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keyword.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [keyword]);

  // DB 검색(ILIKE) — 네이버 실시간 크롤 경로가 아니라 IP 차단 위험 0.
  // 키를 queryKeys.search(라이브 크롤용)와 분리해 캐시 교차오염 방지.
  const searchQuery = useQuery({
    queryKey: queryKeys.complexSearchDb(debouncedKeyword),
    queryFn: ({ signal }) => searchComplexesDb(debouncedKeyword, signal),
    enabled: debouncedKeyword.length >= 2,
    staleTime: 60_000,
  });

  const searchResults = useMemo<PickCandidate[]>(
    () =>
      (searchQuery.data?.complexes ?? []).map((c) => ({
        complex_no: c.complex_no,
        complex_name: c.complex_name,
      })),
    [searchQuery.data?.complexes],
  );

  // 공시가격 조회 — 래퍼가 에러를 그대로 throw 하므로 isError 로 표면화 (error-propagation.md)
  const priceQuery = useQuery({
    queryKey: queryKeys.officialPrices(selectedNo),
    queryFn: () => getOfficialPrices(selectedNo),
    enabled: !!selectedNo,
    staleTime: 60_000,
  });

  const items = useMemo(() => priceQuery.data?.items ?? [], [priceQuery.data?.items]);

  // 단지를 바꾸면 평형 선택·채움 캡션 초기화 (effect 대신 핸들러에서 직접 — 렌더 중 setState 회피)
  const handleSelectComplex = (no: string, name: string) => {
    if (no === selectedNo) return;
    setSelectedNo(no);
    setSelectedName(name);
    setSelectedArea("");
    setFilled(null);
  };

  const handleSelectArea = (value: string) => {
    setSelectedArea(value);
    if (!value) {
      setFilled(null);
      return;
    }
    const item = items.find((it) => String(it.prvuse_ar) === value);
    if (!item) return;
    // 🔴 price_median 은 "호 전체" 공시가 — 지분율을 곱하지 않는다 (엔진이 이미 곱함).
    const manwon = Math.round(item.price_median / 10_000); // 원 → 만원
    onFill(manwon);
    setFilled({ manwon, year: priceQuery.data?.year ?? null });
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-3">
      <h3 className="text-sm font-medium text-gray-700">단지에서 공시가격 불러오기 (선택)</h3>
      <p className="text-xs text-gray-500">
        단지와 평형을 고르면 국토교통부 공동주택 공시가격을 위 입력란에 자동으로 채웁니다.
      </p>

      {candidates.length > 0 && (
        <div>
          <span className="block text-xs font-medium text-gray-600 mb-1.5">
            즐겨찾기·비교 단지
          </span>
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <button
                key={c.complex_no}
                type="button"
                onClick={() => handleSelectComplex(c.complex_no, c.complex_name)}
                aria-pressed={selectedNo === c.complex_no}
                className={`rounded-md border px-3 py-1.5 text-xs min-h-[44px] ${
                  selectedNo === c.complex_no
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {c.complex_name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="pickerKeyword" className="block text-xs font-medium text-gray-600 mb-1.5">
          단지 검색
        </label>
        <input
          id="pickerKeyword"
          type="search"
          autoComplete="off"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="단지명 2글자 이상 (예: 은마)"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        />
        {searchQuery.isLoading && (
          <p className="mt-1 text-xs text-gray-500">검색 중...</p>
        )}
        {searchQuery.isError && (
          <p className="mt-1 text-xs text-red-600">
            단지 검색에 실패했습니다.{" "}
            <button
              type="button"
              onClick={() => searchQuery.refetch()}
              className="underline hover:text-red-700"
            >
              다시 시도
            </button>
          </p>
        )}
        {!searchQuery.isLoading && !searchQuery.isError && debouncedKeyword.length >= 2 && searchResults.length === 0 && (
          <p className="mt-1 text-xs text-gray-500">검색 결과가 없습니다.</p>
        )}
        {searchResults.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
            {searchResults.map((c) => (
              <li key={c.complex_no}>
                <button
                  type="button"
                  onClick={() => handleSelectComplex(c.complex_no, c.complex_name)}
                  className={`w-full text-left px-3 py-2 text-sm min-h-[44px] hover:bg-gray-50 ${
                    selectedNo === c.complex_no ? "bg-blue-50 text-blue-700" : "text-gray-700"
                  }`}
                >
                  {c.complex_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedNo && (
        <div>
          <span className="block text-xs font-medium text-gray-600 mb-1.5">
            선택한 단지: <strong className="text-gray-800">{selectedName}</strong>
          </span>

          {priceQuery.isLoading && (
            <p className="text-xs text-gray-500">공시가격 불러오는 중...</p>
          )}

          {priceQuery.isError && (
            <p className="text-xs text-red-600">
              공시가격을 불러오지 못했습니다.{" "}
              <button
                type="button"
                onClick={() => priceQuery.refetch()}
                className="underline hover:text-red-700"
              >
                다시 시도
              </button>
            </p>
          )}

          {!priceQuery.isLoading && !priceQuery.isError && items.length === 0 && (
            <p className="text-xs text-gray-500">
              이 단지는 공시가격 데이터가 없습니다. 공시가격을 직접 입력해주세요.
            </p>
          )}

          {items.length > 0 && (
            <select
              value={selectedArea}
              onChange={(e) => handleSelectArea(e.target.value)}
              className={SELECT_CLASS}
              aria-label="공시가격 평형 선택"
            >
              <option value="">평형 선택</option>
              {items.map((it) => (
                <option key={it.prvuse_ar} value={String(it.prvuse_ar)}>
                  {`${it.prvuse_ar}㎡ (${toPyeongLabel(it.prvuse_ar)}평) · ${it.ho_count}호`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {filledDone && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600">
            {`출처: 국토교통부 공동주택가격 (${filled?.year ?? "-"}년 기준)`}
          </p>
          {ownershipPercent > 0 && (
            <p className="text-xs text-amber-700">
              호 전체 공시가입니다 — 재산세는 본인 지분 고지 기준이니 공동명의면 지분 공시가로 직접 수정하세요
            </p>
          )}
        </div>
      )}
    </section>
  );
}
