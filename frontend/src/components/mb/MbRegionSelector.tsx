"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMbGuList } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

const SIDO_LIST = [
  "서울", "부산", "대구", "인천",
  "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남",
  "전북", "전남", "경북", "경남",
  "제주",
] as const;

interface Props {
  onSearch: (region: string, gu?: string, keyword?: string) => void;
  defaultRegion?: string;
  defaultGu?: string;
  defaultKeyword?: string;
}

export default function MbRegionSelector({ onSearch, defaultRegion, defaultGu, defaultKeyword }: Props) {
  const [region, setRegion] = useState(defaultRegion ?? "");
  const [gu, setGu] = useState(defaultGu ?? "");
  const [keyword, setKeyword] = useState(defaultKeyword ?? "");

  useEffect(() => { setRegion(defaultRegion ?? ""); }, [defaultRegion]);
  useEffect(() => { setGu(defaultGu ?? ""); }, [defaultGu]);
  useEffect(() => { setKeyword(defaultKeyword ?? ""); }, [defaultKeyword]);

  const guQuery = useQuery({
    queryKey: queryKeys.mb.guList(region),
    queryFn: () => getMbGuList(region),
    enabled: region.length >= 2,
    staleTime: 5 * 60_000,
  });

  const guList = guQuery.data?.gu_list ?? [];

  const handleRegionChange = (value: string) => {
    setRegion(value);
    setGu("");
  };

  const handleSearch = () => {
    if (!region) return;
    onSearch(region, gu || undefined, keyword.trim() || undefined);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="mb-region" className="block text-xs text-gray-500 mb-1">시/도</label>
        <select
          id="mb-region"
          value={region}
          onChange={(e) => handleRegionChange(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">선택</option>
          {SIDO_LIST.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="mb-gu" className="block text-xs text-gray-500 mb-1">시/군/구</label>
        <select
          id="mb-gu"
          value={gu}
          onChange={(e) => setGu(e.target.value)}
          disabled={!region || guList.length === 0}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        >
          <option value="">전체</option>
          {guList.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="mb-keyword" className="block text-xs text-gray-500 mb-1">단지명</label>
        <input
          id="mb-keyword"
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="단지명 검색"
          maxLength={100}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-40"
        />
      </div>

      <button
        onClick={handleSearch}
        disabled={!region}
        className="bg-blue-600 text-white px-5 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        검색
      </button>
    </div>
  );
}
