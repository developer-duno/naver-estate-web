/**
 * FilterBar 드롭다운 내부 콘텐츠 — 7개 섹션 컴포넌트
 */
import type { FilterOptions } from "@/types";
import type { RangePreset } from "@/lib/constants";
import {
  PRICE_PRESETS, PPYEONG_PRESETS, AREA_PRESETS, AREA_PRESETS_PYEONG,
  AREA_PRESETS_OFFICETEL, AREA_PRESETS_OFFICETEL_PYEONG,
  MAINTENANCE_PRESETS, MOVE_IN_OPTIONS, BUILDING_AGE_OPTIONS,
  SORT_OPTIONS, ESTATE_TYPE_FILTER_OPTIONS, YIELD_PRESETS,
  DEPOSIT_PRESETS, MONTHLY_RENT_PRESETS, convertArea,
} from "@/lib/constants";
import type { FilterState, FilterAction } from "./reducer";
import PresetButtons from "./PresetButtons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// ── 공통 Props ──

interface SectionProps {
  s: FilterState;
  setImmediate: (key: keyof FilterState) => (v: string) => void;
  setDebounced: (key: keyof FilterState) => (v: string) => void;
  applyPreset: (p: RangePreset, minK: keyof FilterState, maxK: keyof FilterState) => void;
  dispatch: (action: FilterAction) => void;
  emitChange: (overrides?: Partial<Record<string, string>>) => void;
}

const sectionLabel = "text-sm font-bold text-gray-700 mb-1";
const separator = "border-t border-gray-200 my-2";
const selectCls = "border border-gray-300 rounded px-2 py-2 text-sm bg-white w-full";
const inputCls = "border border-gray-300 rounded px-2 py-2 text-sm w-full";

// ── 거래유형 ──

export function TradeTypeSection({ s, setImmediate }: Pick<SectionProps, "s" | "setImmediate">) {
  return (
    <>
      <p className={sectionLabel}>거래유형 선택</p>
      <ToggleGroup
        type="single"
        value={s.tradeType}
        onValueChange={(v) => { if (v) setImmediate("tradeType")(v); }}
        className="w-auto flex flex-wrap gap-1 mt-1"
      >
        {["전체", "매매", "전세", "월세", "단기임대"].map((t) => (
          <ToggleGroupItem
            key={t}
            value={t}
            className="h-auto min-w-0 px-2 py-1 text-sm border rounded bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50 hover:text-gray-600 data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600"
          >
            {t}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  );
}

// ── 가격 ──

export function priceLabels(tradeType: string): { quick: string; direct: string; aria: string } {
  if (tradeType === "매매") return { quick: "빠른 선택 (매매가)", direct: "매매가 직접입력 (만원)", aria: "매매가" };
  if (tradeType === "전세") return { quick: "", direct: "전세가 직접입력 (만원)", aria: "전세가" };
  if (tradeType === "월세" || tradeType === "단기임대") return { quick: "", direct: "보증금 직접입력 (만원)", aria: "보증금" };
  return { quick: "", direct: "가격 직접입력 (만원)", aria: "가격" };
}

export function PriceSection({ s, setDebounced, applyPreset }: Pick<SectionProps, "s" | "setDebounced" | "applyPreset">) {
  const lbl = priceLabels(s.tradeType);
  const isSale = s.tradeType === "매매";
  const isMonthly = s.tradeType === "월세" || s.tradeType === "단기임대";
  return (
    <>
      {s.tradeType === "전체" && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
          거래유형을 먼저 선택하면 정확한 가격 기준이 표시됩니다
        </div>
      )}

      {isSale && (
        <>
          <p className={sectionLabel}>{lbl.quick}</p>
          <div className="mb-2">
            <PresetButtons presets={PRICE_PRESETS} minKey="minPrice" maxKey="maxPrice"
              currentMin={s.minPrice} currentMax={s.maxPrice} onApply={applyPreset} />
          </div>
          <div className={separator} />
        </>
      )}

      {isMonthly && (
        <>
          <p className={sectionLabel}>보증금 빠른 선택</p>
          <div className="mb-2">
            <PresetButtons presets={DEPOSIT_PRESETS} minKey="minPrice" maxKey="maxPrice"
              currentMin={s.minPrice} currentMax={s.maxPrice} onApply={applyPreset} />
          </div>
          <div className={separator} />
        </>
      )}

      <p className={sectionLabel}>{lbl.direct}</p>
      <div className="flex items-center gap-1 mb-2">
        <input type="number" min="0" value={s.minPrice} onChange={(e) => setDebounced("minPrice")(e.target.value)} className={inputCls} placeholder="최소" aria-label={`최소 ${lbl.aria} (만원)`} />
        <span className="text-sm text-gray-400">~</span>
        <input type="number" min="0" value={s.maxPrice} onChange={(e) => setDebounced("maxPrice")(e.target.value)} className={inputCls} placeholder="최대" aria-label={`최대 ${lbl.aria} (만원)`} />
      </div>

      {isMonthly && (
        <>
          <div className={separator} />
          <p className={sectionLabel}>월세 빠른 선택</p>
          <div className="mb-2">
            <PresetButtons presets={MONTHLY_RENT_PRESETS} minKey="minRent" maxKey="maxRent"
              currentMin={s.minRent} currentMax={s.maxRent} onApply={applyPreset} />
          </div>
          <p className={sectionLabel}>월세 (만원)</p>
          <div className="flex items-center gap-1 mb-2">
            <input type="number" min="0" value={s.minRent} onChange={(e) => setDebounced("minRent")(e.target.value)} className={inputCls} placeholder="최소" aria-label="최소 월세 (만원)" />
            <span className="text-sm text-gray-400">~</span>
            <input type="number" min="0" value={s.maxRent} onChange={(e) => setDebounced("maxRent")(e.target.value)} className={inputCls} placeholder="최대" aria-label="최대 월세 (만원)" />
          </div>
        </>
      )}

      {isSale && (
        <>
          <div className={separator} />
          <p className={sectionLabel}>평당가 (만원/평)</p>
          <div className="mb-2">
            <PresetButtons presets={PPYEONG_PRESETS} minKey="minPpyeong" maxKey="maxPpyeong"
              currentMin={s.minPpyeong} currentMax={s.maxPpyeong} onApply={applyPreset} />
          </div>
          <div className="flex items-center gap-1">
            <input type="number" min="0" value={s.minPpyeong} onChange={(e) => setDebounced("minPpyeong")(e.target.value)} className={inputCls} placeholder="최소" aria-label="최소 평당가 (만원/평)" />
            <span className="text-sm text-gray-400">~</span>
            <input type="number" min="0" value={s.maxPpyeong} onChange={(e) => setDebounced("maxPpyeong")(e.target.value)} className={inputCls} placeholder="최대" aria-label="최대 평당가 (만원/평)" />
          </div>
        </>
      )}

      {isMonthly && (
        <>
          <div className={separator} />
          <p className={sectionLabel}>수익률 (%)</p>
          <div className="mb-2">
            <PresetButtons presets={YIELD_PRESETS} minKey="minYield" maxKey="maxYield"
              currentMin={s.minYield} currentMax={s.maxYield} onApply={applyPreset} />
          </div>
          <div className="flex items-center gap-1">
            <input type="number" min="0" max="100" step="0.1" value={s.minYield} onChange={(e) => setDebounced("minYield")(e.target.value)} className={inputCls} placeholder="최소" aria-label="최소 수익률 (%)" />
            <span className="text-sm text-gray-400">~</span>
            <input type="number" min="0" max="100" step="0.1" value={s.maxYield} onChange={(e) => setDebounced("maxYield")(e.target.value)} className={inputCls} placeholder="최대" aria-label="최대 수익률 (%)" />
          </div>
        </>
      )}
    </>
  );
}

// ── 면적 ──

export function AreaSection({ s, setDebounced, applyPreset, dispatch, emitChange }: Pick<SectionProps, "s" | "setDebounced" | "applyPreset" | "dispatch" | "emitChange">) {
  // 오피스텔/오피스텔분양권 선택 시 실사용 면적대(원룸/1.5룸/투룸/쓰리룸+) 프리셋
  const isOfficetel = s.estateType === "opst" || s.estateType === "obyg";
  const presets = isOfficetel
    ? (s.areaUnit === "평" ? AREA_PRESETS_OFFICETEL_PYEONG : AREA_PRESETS_OFFICETEL)
    : (s.areaUnit === "평" ? AREA_PRESETS_PYEONG : AREA_PRESETS);
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <p className={sectionLabel}>
          전용면적 프리셋{isOfficetel && " (오피스텔)"}
        </p>
        <button
          onClick={() => {
            const from = s.areaUnit as "m²" | "평";
            const next = from === "m²" ? "평" : "m²";
            const nextMin = convertArea(s.minArea, from, next);
            const nextMax = convertArea(s.maxArea, from, next);
            dispatch({ type: "SET_AREA_UNIT", value: next });
            emitChange({ areaUnit: next, minArea: nextMin, maxArea: nextMax });
          }}
          className="px-2 py-1 text-sm border rounded bg-gray-50 border-gray-300 hover:bg-blue-50"
        >
          {s.areaUnit === "m²" ? "평으로" : "m²으로"}
        </button>
      </div>
      <div className="mb-2">
        <PresetButtons presets={presets}
          minKey="minArea" maxKey="maxArea"
          currentMin={s.minArea} currentMax={s.maxArea}
          unit={s.areaUnit as "m²" | "평"} presetUnit="m²"
          onApply={applyPreset} />
      </div>
      <div className={separator} />
      <p className={sectionLabel}>직접 입력 ({s.areaUnit})</p>
      <div className="flex items-center gap-1">
        <input type="number" min="0" value={s.minArea} onChange={(e) => setDebounced("minArea")(e.target.value)} className={inputCls} placeholder="최소" aria-label={`최소 전용면적 (${s.areaUnit})`} />
        <span className="text-sm text-gray-400">~</span>
        <input type="number" min="0" value={s.maxArea} onChange={(e) => setDebounced("maxArea")(e.target.value)} className={inputCls} placeholder="최대" aria-label={`최대 전용면적 (${s.areaUnit})`} />
      </div>
    </>
  );
}

// ── 층수 ──

export function FloorSection({ s, setImmediate }: Pick<SectionProps, "s" | "setImmediate">) {
  return (
    <>
      <p className={sectionLabel}>층수 필터</p>
      <ToggleGroup
        type="single"
        value={s.floorPreset}
        onValueChange={(v) => { if (v) setImmediate("floorPreset")(v); }}
        className="w-auto flex flex-wrap gap-1 mt-1"
      >
        {([
          { k: "전체", l: "전체" },
          { k: "저층", l: "저층(1~5)" },
          { k: "중층", l: "중층(6~10)" },
          { k: "고층", l: "고층(11↑)" },
        ] as const).map(({ k, l }) => (
          <ToggleGroupItem
            key={k}
            value={k}
            className="h-auto min-w-0 px-2 py-1 text-sm border rounded bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50 hover:text-gray-600 data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600"
          >
            {l}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  );
}

// ── 입주 ──

export function MoveInSection({ s, setImmediate }: Pick<SectionProps, "s" | "setImmediate">) {
  return (
    <>
      <p className={sectionLabel}>입주가능일</p>
      <div className={separator} />
      <RadioGroup
        value={s.moveInType}
        onValueChange={(v) => { if (v) setImmediate("moveInType")(v); }}
        className="flex flex-col gap-1"
      >
        {(MOVE_IN_OPTIONS as readonly string[]).map((m) => (
          <label key={m} htmlFor={`movein-${m}`} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
            <RadioGroupItem value={m} id={`movein-${m}`} />
            {m}
          </label>
        ))}
      </RadioGroup>
    </>
  );
}

// ── 방/욕실 ──

export function RoomSection({ s, setImmediate }: Pick<SectionProps, "s" | "setImmediate">) {
  return (
    <>
      <p className={sectionLabel}>방 수</p>
      <Select value={s.minRooms} onValueChange={(v) => setImmediate("minRooms")(v)}>
        <SelectTrigger size="sm" aria-label="최소 방 수" className="w-full bg-white">
          <SelectValue placeholder="전체" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">전체</SelectItem>
          <SelectItem value="1">1+</SelectItem>
          <SelectItem value="2">2+</SelectItem>
          <SelectItem value="3">3+</SelectItem>
          <SelectItem value="4">4+</SelectItem>
        </SelectContent>
      </Select>
      <div className="mt-3">
        <p className={sectionLabel}>욕실 수</p>
        <Select value={s.minBaths} onValueChange={(v) => setImmediate("minBaths")(v)}>
          <SelectTrigger size="sm" aria-label="최소 욕실 수" className="w-full bg-white">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">전체</SelectItem>
            <SelectItem value="1">1+</SelectItem>
            <SelectItem value="2">2+</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// ── 상세 ──

interface DetailSectionProps extends SectionProps {
  filterOptions?: FilterOptions;
}

export function DetailSection({ s, setImmediate, setDebounced, applyPreset, dispatch, emitChange, filterOptions }: DetailSectionProps) {
  return (
    <div className="space-y-3 min-w-60">
      {filterOptions && filterOptions.building_names.length > 0 && (
        <div>
          <p className={sectionLabel}>동</p>
          <Select value={s.buildingName} onValueChange={(v) => setImmediate("buildingName")(v)}>
            <SelectTrigger size="sm" aria-label="동 선택" className="w-full bg-white">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="전체">전체</SelectItem>
              {filterOptions.building_names.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <p className={sectionLabel}>방향</p>
        <Select value={s.direction} onValueChange={(v) => setImmediate("direction")(v)}>
          <SelectTrigger size="sm" aria-label="방향 선택" className="w-full bg-white">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            {(filterOptions?.directions?.length ? ["전체", ...filterOptions.directions] : ["전체", "남향", "남동향", "남서향", "동향", "서향", "북향"]).map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <p className={sectionLabel}>관리비 (만원)</p>
        <div className="mb-1">
          <PresetButtons presets={MAINTENANCE_PRESETS} minKey="minMaint" maxKey="maxMaint"
            currentMin={s.minMaint} currentMax={s.maxMaint} onApply={applyPreset} size="py-0.5" />
        </div>
        <div className="flex items-center gap-1">
          <input type="number" min="0" value={s.minMaint} onChange={(e) => setDebounced("minMaint")(e.target.value)} className={inputCls} placeholder="최소" aria-label="최소 관리비 (만원)" />
          <span className="text-sm text-gray-400">~</span>
          <input type="number" min="0" value={s.maxMaint} onChange={(e) => setDebounced("maxMaint")(e.target.value)} className={inputCls} placeholder="최대" aria-label="최대 관리비 (만원)" />
        </div>
      </div>
      <div>
        <p className={sectionLabel}>준공년도</p>
        <Select value={s.buildingAge} onValueChange={(v) => setImmediate("buildingAge")(v)}>
          <SelectTrigger size="sm" aria-label="준공년도 선택" className="w-full bg-white">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            {(BUILDING_AGE_OPTIONS as readonly { v: string; l: string }[]).map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <p className={sectionLabel}>매물유형</p>
        <Select value={s.estateType} onValueChange={(v) => setImmediate("estateType")(v)}>
          <SelectTrigger size="sm" aria-label="매물유형 선택" className="w-full bg-white">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {ESTATE_TYPE_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={s.verifiedOnly === "true"}
          onChange={(e) => { const v = String(e.target.checked); dispatch({ type: "SET", key: "verifiedOnly", value: v }); emitChange({ verifiedOnly: v }); }}
          className="rounded border-gray-300 accent-blue-600"
        />
        인증매물만
      </label>
      {filterOptions && filterOptions.tags.length > 0 && (
        <div>
          <p className={sectionLabel}>태그</p>
          <ToggleGroup
            type="multiple"
            value={s.tags.split(",").filter(Boolean)}
            onValueChange={(next) => {
              const v = next.join(",");
              dispatch({ type: "SET", key: "tags", value: v });
              emitChange({ tags: v });
            }}
            className="w-auto flex flex-wrap gap-1"
          >
            {filterOptions.tags.map((t) => (
              <ToggleGroupItem
                key={t}
                value={t}
                className="h-auto min-w-0 px-2 py-1 text-sm border rounded bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50 hover:text-gray-600 data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600"
              >
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      <div className="border-t border-gray-200 my-2" />
      <div>
        <p className={sectionLabel}>정렬</p>
        <select value={s.sortBy} onChange={(e) => setImmediate("sortBy")(e.target.value)} className={selectCls} aria-label="정렬 기준">
          {(SORT_OPTIONS as readonly { v: string; l: string }[]).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </div>
    </div>
  );
}
