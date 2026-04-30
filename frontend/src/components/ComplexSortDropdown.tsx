"use client";

import { COMPLEX_SORT_OPTIONS } from "@/lib/constants";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function ComplexSortDropdown({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700 shrink-0">
      <span className="font-medium">정렬:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="단지 정렬"
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {COMPLEX_SORT_OPTIONS.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}
