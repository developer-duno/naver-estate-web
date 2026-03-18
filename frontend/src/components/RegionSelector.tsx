"use client";

import { useState, useEffect, useCallback } from "react";
import { getRegions } from "@/lib/api";
import type { Regions } from "@/types";

// 모듈 레벨 캐시 — 정적 데이터이므로 한 번 로드 후 재사용
let _cachedRegions: Regions | null = null;

interface Props {
  onSearch: (sido: string, sigungu: string, dong?: string) => void;
}

type Step = "sido" | "sigungu" | "dong";

export default function RegionSelector({ onSearch }: Props) {
  const [regions, setRegions] = useState<Regions>(_cachedRegions ?? {});
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [step, setStep] = useState<Step>("sido");
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

  const items = step === "sido" ? sidoList : step === "sigungu" ? sigunguList : dongList;

  const handleSelect = (value: string) => {
    if (step === "sido") {
      setSido(value);
      setSigungu("");
      setStep("sigungu");
    } else if (step === "sigungu") {
      setSigungu(value);
      onSearch(sido, value);
      setStep("dong");
    } else {
      onSearch(sido, sigungu, value);
    }
  };

  const goToSido = () => {
    setSido("");
    setSigungu("");
    setStep("sido");
  };

  const goToSigungu = () => {
    setSigungu("");
    setStep("sigungu");
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

  // 브레드크럼 라벨
  const stepLabel = step === "sido" ? "시/도" : step === "sigungu" ? "시/군/구" : "읍/면/동";

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-1 px-4 py-2.5 bg-gray-50 border-b text-sm" aria-label="지역 선택 경로">
        <button
          type="button"
          onClick={goToSido}
          className={`hover:text-blue-600 transition-colors ${step === "sido" ? "font-bold text-gray-900" : "text-gray-500"}`}
        >
          시/도
        </button>
        {sido && (
          <>
            <span className="text-gray-400 mx-0.5">&gt;</span>
            <button
              type="button"
              onClick={goToSigungu}
              className={`hover:text-blue-600 transition-colors ${step === "sigungu" ? "font-bold text-gray-900" : "text-gray-500"}`}
            >
              {sido}
            </button>
          </>
        )}
        {sigungu && (
          <>
            <span className="text-gray-400 mx-0.5">&gt;</span>
            <span className={step === "dong" ? "font-bold text-gray-900" : "text-gray-500"}>
              {sigungu}
            </span>
          </>
        )}
        {step === "dong" && (
          <>
            <span className="text-gray-400 mx-0.5">&gt;</span>
            <span className="text-gray-400">읍/면/동</span>
          </>
        )}
      </nav>

      {/* 그리드 패널 */}
      <div className="max-h-70 overflow-y-auto">
        {items.length > 0 ? (
          <div className="grid grid-cols-3" role="listbox" aria-label={`${stepLabel} 선택`}>
            {items.map((item) => {
              const isSelected =
                (step === "sigungu" && item === sigungu) ||
                (step === "sido" && item === sido);
              return (
                <button
                  key={item}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item)}
                  className={`px-4 py-2.5 text-sm text-left border-b border-r border-gray-100 transition-colors ${
                    isSelected
                      ? "bg-green-50 text-green-700 font-medium"
                      : "hover:bg-blue-50 text-gray-700"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            {step === "dong" ? "읍/면/동 정보가 없습니다." : "항목이 없습니다."}
          </div>
        )}
      </div>
    </div>
  );
}
