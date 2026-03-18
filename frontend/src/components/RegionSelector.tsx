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
  const [hoveredSido, setHoveredSido] = useState("");
  const [hoveredSigungu, setHoveredSigungu] = useState("");
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
  // hover 중인 시/도의 시/군/구 목록 (선택된 것보다 hover 우선)
  const activeSido = hoveredSido || sido;
  const sigunguList = activeSido ? Object.keys(regions[activeSido] ?? {}) : [];
  // hover 중인 시/군/구의 읍/면/동 목록
  const activeSigungu = hoveredSigungu || sigungu;
  const dongList = activeSido && activeSigungu ? regions[activeSido]?.[activeSigungu] ?? [] : [];

  const handleSidoClick = (value: string) => {
    setSido(value);
    setSigungu("");
    setHoveredSido("");
    setHoveredSigungu("");
  };

  const handleSigunguClick = (value: string) => {
    setSido(activeSido);
    setSigungu(value);
    setHoveredSigungu("");
  };

  const handleDongClick = (value: string) => {
    const finalSido = activeSido;
    const finalSigungu = activeSigungu;
    setSido(finalSido);
    setSigungu(finalSigungu);
    onSearch(finalSido, finalSigungu, value);
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
        <span>지역 정보 로딩 중...</span>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-1 px-4 py-2.5 bg-gray-50 border-b text-sm" aria-label="지역 선택 경로">
        <span className="text-gray-500">시/도</span>
        <span className="text-gray-400 mx-0.5">&gt;</span>
        <span className="text-gray-500">시/군/구</span>
        <span className="text-gray-400 mx-0.5">&gt;</span>
        <span className="text-gray-500">읍/면/동</span>
      </nav>

      {/* 3컬럼 패널 */}
      <div className="flex border-t" style={{ minHeight: "240px" }}>
        {/* 시/도 */}
        <div className="w-1/3 border-r overflow-y-auto max-h-70" role="listbox" aria-label="시/도 선택">
          {sidoList.map((item) => {
            const isSelected = item === sido;
            const isHovered = item === hoveredSido;
            const isActive = item === activeSido;
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSidoClick(item)}
                onMouseEnter={() => setHoveredSido(item)}
                onMouseLeave={() => setHoveredSido("")}
                className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                  isSelected
                    ? "bg-green-50 text-green-700 font-semibold"
                    : isHovered || isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>

        {/* 시/군/구 */}
        <div className="w-1/3 border-r overflow-y-auto max-h-70 bg-white" role="listbox" aria-label="시/군/구 선택">
          {sigunguList.length > 0 ? (
            sigunguList.map((item) => {
              const isSelected = item === sigungu && activeSido === sido;
              const isHovered = item === hoveredSigungu;
              return (
                <button
                  key={item}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSigunguClick(item)}
                  onMouseEnter={() => setHoveredSigungu(item)}
                  onMouseLeave={() => setHoveredSigungu("")}
                  className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                    isSelected
                      ? "bg-green-50 text-green-700 font-semibold"
                      : isHovered
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-8 text-center text-xs text-gray-400">
              시/도를 선택하세요
            </div>
          )}
        </div>

        {/* 읍/면/동 */}
        <div className="w-1/3 overflow-y-auto max-h-70 bg-white" role="listbox" aria-label="읍/면/동 선택">
          {dongList.length > 0 ? (
            dongList.map((item) => (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleDongClick(item)}
                className="w-full px-3 py-2 text-sm text-left text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                {item}
              </button>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-xs text-gray-400">
              시/군/구를 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
