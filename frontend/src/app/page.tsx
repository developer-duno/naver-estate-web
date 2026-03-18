"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getStats } from "@/lib/api";
import RegionSelector from "@/components/RegionSelector";
import EstateTypeTabs from "@/components/EstateTypeTabs";
import { ESTATE_TYPE_TABS } from "@/lib/constants";
import type { DbStats } from "@/types";

export default function HomePage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [stats, setStats] = useState<DbStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const allCodes = ESTATE_TYPE_TABS.map((t) => t.code) as string[];
  const [selectedTypes, setSelectedTypes] = useState<string[]>([...allCodes]);

  const loadStats = () => {
    setStatsLoading(true);
    setStatsError(false);
    getStats()
      .then((data) => { if (!abortRef.current) setStats(data); })
      .catch(() => { if (!abortRef.current) setStatsError(true); })
      .finally(() => { if (!abortRef.current) setStatsLoading(false); });
  };

  const abortRef = useRef(false);
  useEffect(() => {
    abortRef.current = false;
    loadStats();
    return () => { abortRef.current = true; };
  }, []);

  const typesParam = selectedTypes.length < allCodes.length
    ? `&types=${selectedTypes.join(",")}`
    : "";

  const handleKeywordSearch = () => {
    const q = keyword.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}${typesParam}`);
  };

  const handleRegionSearch = (sido: string, sigungu: string, dong?: string) => {
    let path = `/search?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}`;
    if (dong) path += `&dong=${encodeURIComponent(dong)}`;
    router.push(path + typesParam);
  };

  const complexCount = stats?.complex_count ?? 0;
  const articleCount = stats?.article_count ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* 타이틀 + 통계 인라인 */}
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900">네이버 아파트·오피스텔 매물 조회</h1>
        <div className="flex justify-center items-center gap-4 mt-2 text-sm text-gray-500">
          <span>전국 매물을 검색하고 필터링하세요</span>
          <span className="text-gray-300">|</span>
          {statsLoading ? (
            <span className="text-gray-400">통계 로딩...</span>
          ) : statsError ? (
            <button onClick={loadStats} className="text-gray-400 hover:text-blue-500">통계 재시도</button>
          ) : (
            <>
              <span>단지 <strong className="text-blue-600">{complexCount.toLocaleString()}</strong></span>
              <span>매물 <strong className="text-green-600">{articleCount.toLocaleString()}</strong></span>
            </>
          )}
        </div>
      </div>

      {/* 매물유형 탭 */}
      <div className="flex justify-center mb-4">
        <EstateTypeTabs selected={selectedTypes} onChange={setSelectedTypes} />
      </div>

      {/* 검색 영역: 키워드 + 지역 선택 한 카드 */}
      <div className="bg-white rounded-lg shadow-sm border p-4 space-y-4">
        {/* 키워드 검색 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">키워드 검색</label>
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="단지명 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleKeywordSearch()}
              placeholder="단지명 검색 (예: 래미안, 힐스테이트, 강남...)"
              maxLength={100}
              className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleKeywordSearch}
              className="bg-blue-600 text-white px-5 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              검색
            </button>
          </div>
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400">또는</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* 지역 선택 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">지역 선택</label>
          <RegionSelector onSearch={handleRegionSearch} />
        </div>
      </div>
    </div>
  );
}
