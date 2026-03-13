"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getStats } from "@/lib/api";
import RegionSelector from "@/components/RegionSelector";
import type { DbStats } from "@/types";

export default function HomePage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [stats, setStats] = useState<DbStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

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

  const handleKeywordSearch = () => {
    const q = keyword.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const handleRegionSearch = (sido: string, sigungu: string, dong?: string) => {
    let path = `/search?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}`;
    if (dong) path += `&dong=${encodeURIComponent(dong)}`;
    router.push(path);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* 타이틀 */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">네이버 아파트 매물 조회</h1>
        <p className="text-gray-500">전국 아파트 매물을 검색하고 필터링하세요</p>
      </div>

      {/* 통계 */}
      <div className="flex justify-center gap-8 mb-10">
        <div className="bg-white rounded-lg shadow-sm border p-5 text-center min-w-[140px]">
          {statsLoading ? (
            <div className="h-8 w-16 mx-auto bg-gray-200 rounded animate-pulse" />
          ) : statsError ? (
            <div className="text-2xl font-bold text-gray-300 cursor-pointer" onClick={loadStats} title="재시도">---</div>
          ) : (
            <div className="text-2xl font-bold text-blue-600">{(stats?.complex_count ?? 0).toLocaleString()}</div>
          )}
          <div className="text-sm text-gray-500 mt-1">등록 단지</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-5 text-center min-w-[140px]">
          {statsLoading ? (
            <div className="h-8 w-16 mx-auto bg-gray-200 rounded animate-pulse" />
          ) : statsError ? (
            <div className="text-2xl font-bold text-gray-300 cursor-pointer" onClick={loadStats} title="재시도">---</div>
          ) : (
            <div className="text-2xl font-bold text-green-600">{(stats?.article_count ?? 0).toLocaleString()}</div>
          )}
          <div className="text-sm text-gray-500 mt-1">활성 매물</div>
        </div>
      </div>

      {/* 키워드 검색 */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">키워드 검색</h2>
        <div className="flex gap-2">
          <input
            type="text"
            aria-label="단지명 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleKeywordSearch()}
            placeholder="단지명 검색 (예: 래미안, 힐스테이트, 강남...)"
            maxLength={100}
            className="flex-1 border border-gray-300 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleKeywordSearch}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            검색
          </button>
        </div>
      </div>

      {/* 지역 선택 */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-3">지역 선택</h2>
        <RegionSelector onSearch={handleRegionSearch} />
      </div>
    </div>
  );
}
