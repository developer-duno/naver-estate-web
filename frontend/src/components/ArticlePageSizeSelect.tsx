"use client";

import { memo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ArticlePageSize } from "@/lib/storage";

interface Props {
  pageSize: ArticlePageSize;
  onPageSizeChange: (size: ArticlePageSize) => void;
}

const OPTIONS: ArticlePageSize[] = [10, 20, 30, 50];

function ArticlePageSizeSelectInner({ pageSize, onPageSizeChange }: Props) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span>한 페이지당</span>
      <Select
        value={String(pageSize)}
        onValueChange={(v) => onPageSizeChange(Number(v) as ArticlePageSize)}
      >
        <SelectTrigger className="h-8 w-[88px]" aria-label="한 페이지당 매물 개수">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size}개
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default memo(ArticlePageSizeSelectInner);
