"use client";

import { useReducer, useState, useCallback, useRef, useEffect, memo } from "react";
import { usePathname } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import type { ArticleFilters, FilterOptions } from "@/types";
import { DEBOUNCE_MS, convertArea, type RangePreset } from "@/lib/constants";
import { filterReducer, buildInitState, type FilterState } from "./filter/reducer";
import { buildArticleFilters } from "./filter/emitFilters";
import {
  TradeTypeSection,
  PriceSection,
  AreaSection,
  FloorSection,
  MoveInSection,
  RoomSection,
  DetailSection,
} from "./filter/FilterSections";
import { activeFilterCountImmediate } from "./filter/activeCount";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetFooter } from "./ui/sheet";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface Props {
  onChange: (filters: ArticleFilters) => void;
  filterOptions?: FilterOptions;
  onSortChange?: (sortBy: string) => void;
  initialFilters?: ArticleFilters;
}

export default memo(function FilterBarMobileSheet({
  onChange,
  filterOptions,
  onSortChange,
  initialFilters: init,
}: Props) {
  const [s, dispatch] = useReducer(filterReducer, init, buildInitState);
  const [open, setOpen] = useState(false);

  const emitChange = useCallback(
    (overrides: Partial<Record<string, string>> = {}) => {
      onChange(buildArticleFilters(s, overrides));
    },
    [s, onChange],
  );

  const emitChangeRef = useRef(emitChange);
  useEffect(() => {
    emitChangeRef.current = emitChange;
  }, [emitChange]);

  const debounceMapRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const map = debounceMapRef.current;
    return () => {
      Object.values(map).forEach(clearTimeout);
    };
  }, []);

  const pathname = usePathname();
  useEffect(() => {
    // pathname 변경 시 Sheet 자동 닫음 (페이지 전환 시 잔존 방지)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setImmediate = (key: keyof FilterState) => (v: string) => {
    dispatch({ type: "SET", key, value: v });
    if (key === "sortBy" && onSortChange) {
      onSortChange(v);
      return;
    }
    emitChange({ [key]: v });
  };

  const setDebounced = (key: keyof FilterState) => (v: string) => {
    dispatch({ type: "SET", key, value: v });
    if (debounceMapRef.current[key]) clearTimeout(debounceMapRef.current[key]);
    debounceMapRef.current[key] = setTimeout(
      () => emitChangeRef.current({ [key]: v }),
      DEBOUNCE_MS,
    );
  };

  const applyPreset = (preset: RangePreset, minKey: keyof FilterState, maxKey: keyof FilterState) => {
    const isAreaPyeong = minKey === "minArea" && s.areaUnit === "평";
    const rawMin = preset.min !== undefined ? String(preset.min) : "";
    const rawMax = preset.max !== undefined ? String(preset.max) : "";
    const minVal = isAreaPyeong ? convertArea(rawMin, "m²", "평") : rawMin;
    const maxVal = isAreaPyeong ? convertArea(rawMax, "m²", "평") : rawMax;
    dispatch({ type: "SET_MULTI", updates: { [minKey]: minVal, [maxKey]: maxVal } });
    emitChange({ [minKey]: minVal, [maxKey]: maxVal });
  };

  const resetAll = () => {
    dispatch({ type: "RESET" });
    if (onSortChange) onSortChange("rank");
    onChange({});
  };

  // "결과 보기" 즉시 emit: 진행 중인 debounce timeout 을 clear 하고
  // 최신 state (s) 를 빈 overrides 로 즉시 전달. setTimeout 클리어 안 하면
  // 사용자가 시트 닫은 후에 옛 콜백이 깨어나 결과를 한 번 더 덮어쓰는 race 발생.
  const flushDebounce = useCallback(() => {
    Object.values(debounceMapRef.current).forEach(clearTimeout);
    debounceMapRef.current = {};
    emitChangeRef.current({});
  }, []);

  const sectionProps = { s, setImmediate, setDebounced, applyPreset, dispatch, emitChange };
  const activeCount = activeFilterCountImmediate(s);
  const triggerLabel = activeCount > 0 ? `필터 창 열기 (활성 ${activeCount}개)` : "필터 창 열기";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" aria-label={triggerLabel} className="gap-1.5">
          <SlidersHorizontal aria-hidden="true" />
          필터
          {activeCount > 0 && (
            <Badge variant="default" className="min-w-6">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="no-print max-h-[85svh] overflow-y-auto p-4"
        aria-label="매물 필터"
      >
        <SheetTitle asChild>
          <h3 className="font-heading text-base font-medium">필터</h3>
        </SheetTitle>
        <SheetDescription className="sr-only">
          매물 거래유형·가격·면적 등 7가지 조건으로 매물을 필터링합니다.
        </SheetDescription>

        <div className="mt-3 space-y-4">
          <TradeTypeSection s={s} setImmediate={setImmediate} />
          <PriceSection s={s} setDebounced={setDebounced} applyPreset={applyPreset} />
          <AreaSection {...sectionProps} />
          <FloorSection s={s} setImmediate={setImmediate} />
          <MoveInSection s={s} setImmediate={setImmediate} />
          <RoomSection s={s} setImmediate={setImmediate} />
          <DetailSection {...sectionProps} filterOptions={filterOptions} />
        </div>

        <SheetFooter className="sticky bottom-0 mt-4 flex flex-row gap-2 border-t bg-popover p-3">
          <Button variant="outline" size="sm" onClick={resetAll} className="flex-1">
            초기화
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              flushDebounce();
              setOpen(false);
            }}
            className="flex-1"
          >
            결과 보기
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
});
