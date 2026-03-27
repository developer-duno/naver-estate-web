"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRegions } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Regions } from "@/types";

interface Props {
  onSearch: (sido: string, sigungu: string, dong?: string) => void;
}

export default function RegionSelector({ onSearch }: Props) {
  const { data: regions = {} as Regions, isLoading: loading, isError: error, refetch: loadRegions } = useQuery({
    queryKey: queryKeys.regions,
    queryFn: () => getRegions(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [dong, setDong] = useState("");

  const sidoList = Object.keys(regions);
  const sigunguList = sido ? Object.keys(regions[sido] ?? {}) : [];
  const dongList = sido && sigungu ? regions[sido]?.[sigungu] ?? [] : [];

  const handleSidoChange = (value: string) => {
    setSido(value);
    setDong("");
    const sgList = value ? Object.keys(regions[value] ?? {}) : [];
    if (sgList.length === 1) {
      setSigungu(sgList[0]);
    } else {
      setSigungu("");
    }
  };

  const handleSigunguChange = (value: string) => {
    setSigungu(value);
    setDong("");
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
          onClick={() => loadRegions()}
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
