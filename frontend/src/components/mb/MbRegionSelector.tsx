"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMbRegions } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

const SIDO_LIST = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시",
  "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
  "경기도", "강원도", "충청북도", "충청남도",
  "전라북도", "전라남도", "경상북도", "경상남도",
  "제주특별자치도",
] as const;

interface Props {
  onSearch: (region: string, gu?: string) => void;
  defaultRegion?: string;
  defaultGu?: string;
}

export default function MbRegionSelector({ onSearch, defaultRegion, defaultGu }: Props) {
  const [region, setRegion] = useState(defaultRegion ?? "");
  const [gu, setGu] = useState(defaultGu ?? "");

  useEffect(() => { setRegion(defaultRegion ?? ""); }, [defaultRegion]);
  useEffect(() => { setGu(defaultGu ?? ""); }, [defaultGu]);

  const regionsQuery = useQuery({
    queryKey: queryKeys.mb.regions(region),
    queryFn: () => getMbRegions(region),
    enabled: region.length >= 2,
    staleTime: 60_000,
  });

  const guList = useMemo(() => {
    if (!regionsQuery.data?.regions) return [];
    return [...new Set(regionsQuery.data.regions.map((r) => r.gu).filter(Boolean))] as string[];
  }, [regionsQuery.data]);

  const handleRegionChange = (value: string) => {
    setRegion(value);
    setGu("");
  };

  const handleSearch = () => {
    if (!region) return;
    onSearch(region, gu || undefined);
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
