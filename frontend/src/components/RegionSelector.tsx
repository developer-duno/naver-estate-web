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
  const sigunguList = sido ? Object.keys(regions[sido] ?? {}) : [];
  const dongList = sido && sigungu ? regions[sido]?.[sigungu] ?? [] : [];

  const handleSidoChange = (value: string) => {
    setSido(value);
    setSigungu("");
    setDong("");
  };

  const handleSigunguChange = (value: string) => {
    setSigungu(value);
    setDong("");
    // 시/군/구 선택 시 즉시 검색 (동은 선택사항)
    if (value && sido) {
      onSearch(sido, value);
    }
  };

  const handleDongChange = (value: string) => {
    setDong(value);
    if (value && sido && sigungu) {
      onSearch(sido, sigungu, value);
    }
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

  const selectClass = "border border-gray-300 rounded-md px-3 py-2 text-sm min-w-0 flex-1";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        aria-label="시/도"
        value={sido}
        onChange={(e) => handleSidoChange(e.target.value)}
        className={selectClass}
        disabled={loading}
      >
        <option value="">{loading ? "로딩..." : "시/도"}</option>
        {sidoList.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        aria-label="시/군/구"
        value={sigungu}
        onChange={(e) => handleSigunguChange(e.target.value)}
        className={selectClass}
        disabled={!sido}
      >
        <option value="">시/군/구</option>
        {sigunguList.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        aria-label="읍/면/동"
        value={dong}
        onChange={(e) => handleDongChange(e.target.value)}
        className={selectClass}
        disabled={!sigungu}
      >
        <option value="">읍/면/동</option>
        {dongList.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}
