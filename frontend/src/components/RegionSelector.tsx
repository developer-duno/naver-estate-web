"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRegions } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Regions } from "@/types";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

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

  // @base-ui Combobox onValueChange 는 clear 시 null 전달 → "" 로 정규화
  const handleSidoChange = (value: string | null) => {
    const v = value ?? "";
    setSido(v);
    setDong("");
    const sgList = v ? Object.keys(regions[v] ?? {}) : [];
    if (sgList.length === 1) {
      setSigungu(sgList[0]);
    } else {
      setSigungu("");
    }
  };

  const handleSigunguChange = (value: string | null) => {
    setSigungu(value ?? "");
    setDong("");
  };

  const handleDongChange = (value: string | null) => {
    const v = value ?? "";
    setDong(v);
    if (v && sido && sigungu) {
      onSearch(sido, sigungu, v);
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <Combobox value={sido} onValueChange={handleSidoChange} items={sidoList} disabled={loading}>
        <ComboboxInput aria-label="시/도" placeholder={loading ? "로딩..." : "시/도"} className="w-full" disabled={loading} />
        <ComboboxContent>
          <ComboboxEmpty>일치하는 시/도가 없습니다</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <Combobox value={sigungu} onValueChange={handleSigunguChange} items={sigunguList} disabled={!sido}>
        <ComboboxInput aria-label="시/군/구" placeholder="시/군/구" className="w-full" disabled={!sido} />
        <ComboboxContent>
          <ComboboxEmpty>일치하는 시/군/구가 없습니다</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <Combobox value={dong} onValueChange={handleDongChange} items={dongList} disabled={!sigungu}>
        <ComboboxInput aria-label="읍/면/동" placeholder="읍/면/동" className="w-full" disabled={!sigungu} />
        <ComboboxContent>
          <ComboboxEmpty>일치하는 읍/면/동이 없습니다</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
