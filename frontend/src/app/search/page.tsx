"use client";

import { useState, useEffect, useCallback, useRef, memo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { searchComplexes, getComplexesByRegion } from "@/lib/api";
import RegionSelector from "@/components/RegionSelector";
import type { Complex } from "@/types";

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [complexes, setComplexes] = useState<Complex[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inlineKeyword, setInlineKeyword] = useState("");
  const requestIdRef = useRef(0);

  const keyword = searchParams.get("q") || "";
  const sido = searchParams.get("sido") || "";
  const sigungu = searchParams.get("sigungu") || "";
  const dong = searchParams.get("dong") || "";

  const hasSearchParams = !!(keyword || (sido && sigungu));

  const title = keyword
    ? `"${keyword}" 검색 결과`
    : sido && sigungu
    ? `${sido} ${sigungu}${dong ? ` ${dong}` : ""} 단지 목록`
    : "검색";

  const fetchData = useCallback(async (signal: AbortSignal) => {
    if (!keyword && !(sido && sigungu)) return;
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      let result: { complexes: Complex[] };
      if (keyword) {
        result = await searchComplexes(keyword, 50, signal);
      } else {
        result = await getComplexesByRegion(sido, sigungu, dong || undefined, signal);
      }
      if (reqId !== requestIdRef.current) return;
      setComplexes(result.complexes);
    } catch (err) {
      if (signal.aborted) return; // 취소된 요청은 에러 무시
      if (reqId !== requestIdRef.current) return;
      setError("검색에 실패했습니다. 다시 시도해주세요.");
    } finally {
      if (reqId === requestIdRef.current && !signal.aborted) {
        setLoading(false);
      }
    }
  }, [keyword, sido, sigungu, dong]);

  useEffect(() => {
    if (!hasSearchParams) return;
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData, hasSearchParams]);

  // SEO: 동적 타이틀
  useEffect(() => {
    document.title = hasSearchParams
      ? `${title} - 아파트 매물`
      : "검색 - 아파트 매물";
  }, [title, hasSearchParams]);

  const handleInlineKeywordSearch = () => {
    const q = inlineKeyword.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const handleInlineRegionSearch = (s: string, sg: string, d?: string) => {
    let path = `/search?sido=${encodeURIComponent(s)}&sigungu=${encodeURIComponent(sg)}`;
    if (d) path += `&dong=${encodeURIComponent(d)}`;
    router.push(path);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => { try { const r = document.referrer; if (r && new URL(r).origin === window.location.origin) { window.history.back(); } else { router.push("/"); } } catch { router.push("/"); } }} aria-label="이전 페이지" className="text-gray-400 hover:text-gray-600 text-xl">
          ←
        </button>
        <h1 className="text-2xl font-bold">{title}</h1>
        {hasSearchParams && !loading && (
          <span className="text-gray-500 text-sm">({complexes.length}개 단지)</span>
        )}
      </div>

      {/* 검색 파라미터 없을 때: 인라인 검색 폼 */}
      {!hasSearchParams && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-3">키워드 검색</h2>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="단지명 검색"
                value={inlineKeyword}
                onChange={(e) => setInlineKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInlineKeywordSearch()}
                placeholder="단지명 검색 (예: 래미안, 힐스테이트, 강남...)"
                maxLength={100}
                className="flex-1 border border-gray-300 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleInlineKeywordSearch}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                검색
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-3">지역 선택</h2>
            <RegionSelector onSearch={handleInlineRegionSearch} />
          </div>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" role="status" aria-label="로딩 중" />
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="text-center py-8">
          <p className="text-red-500 mb-3">{error}</p>
          <button
            onClick={() => fetchData(new AbortController().signal)}
            className="text-sm text-blue-600 hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 결과 없음 */}
      {hasSearchParams && !loading && !error && complexes.length === 0 && (
        <div className="text-center py-16 text-gray-500">검색 결과가 없습니다.</div>
      )}

      {/* 단지 테이블 */}
      {!loading && complexes.length > 0 && (
        <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100 border-b-2 border-gray-300 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[45px] text-center">No</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 min-w-[140px] text-left">단지명</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 min-w-[200px] text-left">주소</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[70px] text-right">세대수</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[55px] text-right">동수</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[60px] text-right">최고층</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[60px] text-center">준공</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[65px] text-center">유형</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap w-[65px] text-right">매물수</th>
              </tr>
            </thead>
            <tbody>
              {complexes.map((cpx, idx) => (
                <ComplexRow key={cpx.complex_no} complex={cpx} index={idx + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ComplexRow = memo(function ComplexRow({ complex, index }: { complex: Complex; index: number }) {
  const router = useRouter();
  const year = complex.use_approve_ymd?.slice(0, 4);
  const articleCount = complex.article_count ?? 0;
  const isEven = index % 2 === 0;

  return (
    <tr
      className={`hover:bg-blue-50 cursor-pointer transition-colors border-b border-gray-200 ${isEven ? "bg-gray-50/60" : "bg-white"}`}
      onClick={() => router.push(`/complex/${complex.complex_no}`)}
    >
      <td className="px-3 py-2 text-gray-400 text-center text-xs border-r border-gray-100">{index}</td>
      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap border-r border-gray-100">{complex.complex_name}</td>
      <td className="px-3 py-2 text-gray-600 max-w-[300px] truncate border-r border-gray-100" title={complex.cortar_address || ""}>{complex.cortar_address || "-"}</td>
      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap border-r border-gray-100">{complex.total_household_count ? complex.total_household_count.toLocaleString() : "-"}</td>
      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap border-r border-gray-100">{complex.total_dong_count || "-"}</td>
      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap border-r border-gray-100">{complex.high_floor ? `${complex.high_floor}층` : "-"}</td>
      <td className="px-3 py-2 text-center text-gray-700 whitespace-nowrap border-r border-gray-100">{year || "-"}</td>
      <td className="px-3 py-2 text-center whitespace-nowrap border-r border-gray-100">
        {complex.real_estate_type_name ? (
          <span className="text-xs px-1.5 py-0.5 rounded border border-teal-300 text-teal-600">{complex.real_estate_type_name}</span>
        ) : "-"}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${articleCount > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>{articleCount}건</span>
      </td>
    </tr>
  );
});

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" role="status" aria-label="로딩 중" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
