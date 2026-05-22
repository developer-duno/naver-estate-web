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
}

export default function ComplexSortDropdown({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700 shrink-0">
      <span className="font-medium">정렬:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" aria-label="단지 정렬" className="bg-white">
          <SelectValue placeholder="정렬 선택" />
        </SelectTrigger>
        <SelectContent>
          {COMPLEX_SORT_OPTIONS.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
