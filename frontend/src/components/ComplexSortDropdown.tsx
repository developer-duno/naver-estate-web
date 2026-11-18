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
  /** navy = 검색 결과 남색 띠 안 칩 모양(「정렬:」 글자 없이 고른 이름 + ▾ · 세션 525 B40 PR 2a) */
  tone?: "default" | "navy";
}

export default function ComplexSortDropdown({ value, onChange, publicView = false, tone = "default" }: Props) {
  const options = publicView
    ? COMPLEX_SORT_OPTIONS.filter((o) => o.v !== "article_desc")
    : COMPLEX_SORT_OPTIONS;
  const navy = tone === "navy";
  return (
    <label className="flex items-center gap-1.5 text-sm text-brand-navy shrink-0">
      {!navy && <span className="font-medium">정렬:</span>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          size="sm"
          aria-label="단지 정렬"
          className={
            navy
              ? "data-[size=sm]:h-10 rounded-full data-[size=sm]:rounded-full border-brand-navy-line bg-transparent px-3.5 font-medium text-white hover:bg-white/10 [&_svg]:text-white"
              : "bg-white border-brand-line"
          }
        >
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
