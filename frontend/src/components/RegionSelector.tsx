"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(!_cachedRegions);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 패널 밖 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // 타이머 정리
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => setOpen(false), 200);
  };

  const sidoList = Object.keys(regions);
  const activeSido = hoveredSido || sido;
  const sigunguList = activeSido ? Object.keys(regions[activeSido] ?? {}) : [];
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
    setOpen(false);
    onSearch(finalSido, finalSigungu, value);
  };

  // 선택된 지역 요약 텍스트
  const summary = sido && sigungu
    ? `${sido} ${sigungu}`
    : sido
      ? sido
      : "지역을 선택하세요";

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
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 트리거 버튼 */}
      <button
        type="button"
        className="flex items-center gap-2 border border-gray-300 rounded-md px-4 py-2 text-sm hover:border-blue-400 hover:bg-blue-50 transition-colors"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
        <span className="text-gray-700">{loading ? "로딩..." : summary}</span>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 팝업 패널 */}
      {open && !loading && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border rounded-lg shadow-lg w-150">
          {/* 브레드크럼 */}
          <nav className="flex items-center gap-1 px-4 py-2 bg-gray-50 border-b text-xs text-gray-500" aria-label="지역 선택 경로">
            <span className={activeSido ? "text-gray-400" : "font-semibold text-gray-700"}>시/도</span>
            <span className="text-gray-300 mx-0.5">&gt;</span>
            <span className={activeSido && !activeSigungu ? "font-semibold text-gray-700" : activeSigungu ? "text-gray-400" : "text-gray-400"}>
              {activeSido || "시/군/구"}
            </span>
            <span className="text-gray-300 mx-0.5">&gt;</span>
            <span className={activeSigungu ? "font-semibold text-gray-700" : "text-gray-400"}>
              {activeSigungu || "읍/면/동"}
            </span>
          </nav>

          {/* 3컬럼 */}
          <div className="flex" style={{ height: "280px" }}>
            {/* 시/도 */}
            <div className="w-1/3 border-r overflow-y-auto" role="listbox" aria-label="시/도 선택">
              {sidoList.map((item) => {
                const isSelected = item === sido;
                const isHovered = item === hoveredSido;
                const isActive = item === activeSido && !isHovered;
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
                        : isHovered
                          ? "bg-blue-50 text-blue-700"
                          : isActive
                            ? "bg-gray-50 text-gray-700"
                            : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            {/* 시/군/구 */}
            <div className="w-1/3 border-r overflow-y-auto bg-white" role="listbox" aria-label="시/군/구 선택">
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
            <div className="w-1/3 overflow-y-auto bg-white" role="listbox" aria-label="읍/면/동 선택">
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
      )}
    </div>
  );
}
