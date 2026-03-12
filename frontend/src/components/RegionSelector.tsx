"use client";

import { useState, useEffect, useCallback } from "react";
import { getRegions } from "@/lib/api";
import type { Regions } from "@/types";

// 모듈 레벨 캐시 — 정적 데이터이므로 한 번 로드 후 재사용
let _cachedRegions: Regions | null = null;

interface Props {
  onSearch: (sido: string, sigungu: string, dong?: string) => void;
}

export default function RegionSelector({ onSearch }: Props) {
  const [regions, setRegions] = useState<Regions>(_cachedRegions ?? {});
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [dong, setDong] = useState("");
  const [loading, setLoading] = useState(!_cachedRegions);
  const [error, setError] = useState(false);

  const loadRegions = useCallback(() => {
    if (_cachedRegions) {
      setRegions(_cachedRegions);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    getRegions()
      .then((data) => {
        _cachedRegions = data;
        setRegions(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  const sidoList = Object.keys(regions);
  const sigunguList = sido ? Object.keys(regions[sido] || {}) : [];
  const dongList = sido && sigungu ? regions[sido]?.[sigungu] || [] : [];

  const handleSidoChange = (value: string) => {
    setSido(value);
    setSigungu("");
    setDong("");
  };

  const handleSigunguChange = (value: string) => {
    setSigungu(value);
    setDong("");
  };

  const handleSearch = () => {
    if (!sido || !sigungu) return;
    onSearch(sido, sigungu, dong || undefined);
  };

  if (error) {
    return (
      <div className="flex items-center gap-3 text-sm text-red-500">
        <span>지역 정보를 불러올 수 없습니다.</span>
        <button
          onClick={loadRegions}
          className="text-blue-600 hover:underline font-medium"
        >
          재시도
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div>
        <label htmlFor="region-sido" className="block text-xs text-gray-500 mb-1">시/도</label>
        <select
          id="region-sido"
          value={sido}
          onChange={(e) => handleSidoChange(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[120px]"
          disabled={loading}
        >
          <option value="">{loading ? "로딩..." : "선택"}</option>
          {sidoList.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="region-sigungu" className="block text-xs text-gray-500 mb-1">시/군/구</label>
        <select
          id="region-sigungu"
          value={sigungu}
          onChange={(e) => handleSigunguChange(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[130px]"
          disabled={!sido}
        >
          <option value="">선택</option>
          {sigunguList.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="region-dong" className="block text-xs text-gray-500 mb-1">읍/면/동</label>
        <select
          id="region-dong"
          value={dong}
          onChange={(e) => setDong(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[130px]"
          disabled={!sigungu}
        >
          <option value="">전체</option>
          {dongList.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSearch}
        disabled={!sido || !sigungu}
        className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        검색
      </button>
    </div>
  );
}
