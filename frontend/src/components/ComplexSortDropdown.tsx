"use client";

import { COMPLEX_SORT_OPTIONS } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** 비로그인으로 확정된 화면 — 네이버 재료(매물 수) 기준 정렬 선택지를 뺀다(세션 491). */
  publicView?: boolean;
}

export default function ComplexSortDropdown({ value, onChange, publicView = false }: Props) {
  const options = publicView
    ? COMPLEX_SORT_OPTIONS.filter((o) => o.v !== "article_desc")
    : COMPLEX_SORT_OPTIONS;
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700 shrink-0">
      <span className="font-medium">정렬:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" aria-label="단지 정렬" className="bg-white">
          <SelectValue placeholder="정렬 선택" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
