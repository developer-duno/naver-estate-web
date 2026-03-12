"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ArticleFilters } from "@/types";
import { M2_TO_PYEONG } from "@/lib/constants";

interface Props {
  onChange: (filters: ArticleFilters) => void;
}

export default function FilterBar({ onChange }: Props) {
  const [tradeType, setTradeType] = useState("전체");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minRent, setMinRent] = useState("");
  const [maxRent, setMaxRent] = useState("");
  const [areaUnit, setAreaUnit] = useState<"m²" | "평">("m²");
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");
  const [minRooms, setMinRooms] = useState("0");
  const [minBaths, setMinBaths] = useState("0");
  const [direction, setDirection] = useState("전체");
  const [minPpyeong, setMinPpyeong] = useState("");
  const [maxPpyeong, setMaxPpyeong] = useState("");
  const [minMaint, setMinMaint] = useState("");
  const [maxMaint, setMaxMaint] = useState("");
  const [buildingAge, setBuildingAge] = useState("0");
  const [moveInType, setMoveInType] = useState("전체");
  const [estateType, setEstateType] = useState("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortBy, setSortBy] = useState("rank");

  const emitChange = useCallback(
    (overrides: Partial<Record<string, string>> = {}) => {
      const get = (key: string, fallback: string) => overrides[key] ?? fallback;

      const filters: ArticleFilters = {};
      const tt = get("tradeType", tradeType);
      if (tt !== "전체") filters.trade_types = tt;

      const mp = get("minPrice", minPrice);
      const xp = get("maxPrice", maxPrice);
      if (mp) filters.min_price = Number(mp);
      if (xp) filters.max_price = Number(xp);

      const mr = get("minRent", minRent);
      const xr = get("maxRent", maxRent);
      if (mr) filters.min_rent = Number(mr);
      if (xr) filters.max_rent = Number(xr);

      const unit = get("areaUnit", areaUnit);
      const ma = get("minArea", minArea);
      const xa = get("maxArea", maxArea);
      if (ma) {
        filters.min_area_m2 = unit === "평" ? Number(ma) * M2_TO_PYEONG : Number(ma);
      }
      if (xa) {
        filters.max_area_m2 = unit === "평" ? Number(xa) * M2_TO_PYEONG : Number(xa);
      }

      const rooms = get("minRooms", minRooms);
      if (rooms !== "0") filters.min_rooms = Number(rooms);
      const baths = get("minBaths", minBaths);
      if (baths !== "0") filters.min_baths = Number(baths);

      const dir = get("direction", direction);
      if (dir !== "전체") filters.direction = dir;

      const mpp = get("minPpyeong", minPpyeong);
      const xpp = get("maxPpyeong", maxPpyeong);
      if (mpp) filters.min_ppyeong = Number(mpp);
      if (xpp) filters.max_ppyeong = Number(xpp);

      const mm = get("minMaint", minMaint);
      const xm = get("maxMaint", maxMaint);
      if (mm) filters.min_maintenance = Number(mm);
      if (xm) filters.max_maintenance = Number(xm);

      const age = get("buildingAge", buildingAge);
      if (age !== "0") filters.max_building_age = Number(age);

      const mi = get("moveInType", moveInType);
      if (mi !== "전체") filters.move_in_type = mi;

      const et = get("estateType", estateType);
      if (et !== "all") filters.estate_type = et;

      const vo = get("verifiedOnly", String(verifiedOnly));
      if (vo === "true") filters.verified_only = true;

      const sb = get("sortBy", sortBy);
      if (sb !== "rank") filters.sort_by = sb;

      onChange(filters);
    },
    [
      tradeType, minPrice, maxPrice, minRent, maxRent,
      areaUnit, minArea, maxArea, minRooms, minBaths,
      direction, minPpyeong, maxPpyeong, minMaint, maxMaint,
      buildingAge, moveInType, estateType, verifiedOnly, sortBy, onChange,
    ]
  );

  // 숫자 입력 필드 디바운스 (300ms)
  const debounceMapRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    return () => { Object.values(debounceMapRef.current).forEach(clearTimeout); };
  }, []);

  const setImmediate = (setter: (v: string) => void, key: string) => (v: string) => {
    setter(v);
    emitChange({ [key]: v });
  };

  const setDebounced = (setter: (v: string) => void, key: string) => (v: string) => {
    setter(v);
    if (debounceMapRef.current[key]) clearTimeout(debounceMapRef.current[key]);
    debounceMapRef.current[key] = setTimeout(() => emitChange({ [key]: v }), 300);
  };

  const resetAll = () => {
    setTradeType("전체");
    setMinPrice(""); setMaxPrice("");
    setMinRent(""); setMaxRent("");
    setAreaUnit("m²"); setMinArea(""); setMaxArea("");
    setMinRooms("0"); setMinBaths("0");
    setDirection("전체");
    setMinPpyeong(""); setMaxPpyeong("");
    setMinMaint(""); setMaxMaint("");
    setBuildingAge("0"); setMoveInType("전체");
    setEstateType("all"); setVerifiedOnly(false); setSortBy("rank");
    onChange({});
  };

  const [expanded, setExpanded] = useState(false);
  const selectCls = "border border-gray-300 rounded px-2 py-1.5 text-sm bg-white";
  const inputCls = "border border-gray-300 rounded px-2 py-1.5 text-sm w-28";

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
      {/* 모바일: 항상 보이는 핵심 필터 + 토글 */}
      <div className="flex items-end gap-2 flex-wrap">
        <FilterSelect label="거래유형" value={tradeType} onChange={setImmediate(setTradeType, "tradeType")}
          options={["전체", "매매", "전세", "월세"]} className="w-24" />

        <FilterInput label="최소 가격(만원)" value={minPrice} onChange={setDebounced(setMinPrice, "minPrice")} className={inputCls} />
        <FilterInput label="최대 가격(만원)" value={maxPrice} onChange={setDebounced(setMaxPrice, "maxPrice")} className={inputCls} />

        {tradeType === "월세" && (
          <>
            <FilterInput label="최소 월세(만원)" value={minRent} onChange={setDebounced(setMinRent, "minRent")} className={inputCls} />
            <FilterInput label="최대 월세(만원)" value={maxRent} onChange={setDebounced(setMaxRent, "maxRent")} className={inputCls} />
          </>
        )}

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">면적단위</label>
          <div className="flex">
            {(["m²", "평"] as const).map((u) => (
              <button
                key={u}
                onClick={() => { setAreaUnit(u); emitChange({ areaUnit: u }); }}
                aria-pressed={areaUnit === u}
                className={`px-2 py-1.5 text-sm border ${
                  areaUnit === u ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-300"
                } ${u === "m²" ? "rounded-l" : "rounded-r"}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <FilterInput label="최소 면적" value={minArea} onChange={setDebounced(setMinArea, "minArea")} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24" />
        <FilterInput label="최대 면적" value={maxArea} onChange={setDebounced(setMaxArea, "maxArea")} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24" />

        <FilterSelect label="방" value={minRooms} onChange={setImmediate(setMinRooms, "minRooms")}
          options={[{ v: "0", l: "전체" }, { v: "1", l: "1+" }, { v: "2", l: "2+" }, { v: "3", l: "3+" }, { v: "4", l: "4+" }]}
          className="w-20" />

        <FilterSelect label="욕실" value={minBaths} onChange={setImmediate(setMinBaths, "minBaths")}
          options={[{ v: "0", l: "전체" }, { v: "1", l: "1+" }, { v: "2", l: "2+" }]}
          className="w-20" />

        <FilterSelect label="정렬" value={sortBy} onChange={setImmediate(setSortBy, "sortBy")}
          options={[
            { v: "rank", l: "기본순" },
            { v: "price_asc", l: "가격↑" },
            { v: "price_desc", l: "가격↓" },
            { v: "area_desc", l: "면적↓" },
            { v: "area_asc", l: "면적↑" },
            { v: "ppyeong_asc", l: "평당가↑" },
            { v: "maintenance_asc", l: "관리비↑" },
            { v: "confirm_desc", l: "확인일자순" },
          ]}
          className="w-28" />

        <button
          onClick={() => setExpanded(!expanded)}
          className="md:hidden text-sm text-blue-600 hover:text-blue-800 px-2 py-1.5"
        >
          {expanded ? "필터 접기 ▲" : "필터 더보기 ▼"}
        </button>
      </div>

      {/* 확장 필터 (데스크톱: 항상 표시, 모바일: 토글) */}
      <div className={`${expanded ? "block" : "hidden"} md:block`}>
      <div className="flex items-end gap-2 flex-wrap">
        <FilterSelect label="방향" value={direction} onChange={setImmediate(setDirection, "direction")}
          options={["전체", "남향", "남동향", "남서향", "동향", "서향", "북향"]}
          className="w-24" />
        <FilterInput label="최소 평당가(만원)" value={minPpyeong} onChange={setDebounced(setMinPpyeong, "minPpyeong")} className={inputCls + " w-32"} />
        <FilterInput label="최대 평당가(만원)" value={maxPpyeong} onChange={setDebounced(setMaxPpyeong, "maxPpyeong")} className={inputCls + " w-32"} />

        <FilterInput label="최소 관리비(만원)" value={minMaint} onChange={setDebounced(setMinMaint, "minMaint")} className={inputCls + " w-32"} />
        <FilterInput label="최대 관리비(만원)" value={maxMaint} onChange={setDebounced(setMaxMaint, "maxMaint")} className={inputCls + " w-32"} />

        <FilterSelect label="준공년도" value={buildingAge} onChange={setImmediate(setBuildingAge, "buildingAge")}
          options={[
            { v: "0", l: "전체" }, { v: "5", l: "5년 이내" }, { v: "10", l: "10년 이내" },
            { v: "15", l: "15년 이내" }, { v: "20", l: "20년 이내" }, { v: "25", l: "25년 이내" }, { v: "30", l: "30년 이내" },
          ]}
          className="w-28" />

        <FilterSelect label="입주가능일" value={moveInType} onChange={setImmediate(setMoveInType, "moveInType")}
          options={["전체", "즉시입주", "1개월", "3개월", "6개월", "협의"]}
          className="w-28" />

        <FilterSelect label="매물유형" value={estateType} onChange={setImmediate(setEstateType, "estateType")}
          options={[{ v: "all", l: "전체" }, { v: "general", l: "일반" }, { v: "presale", l: "분양권" }]}
          className="w-24" />

        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer py-1.5">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => {
                setVerifiedOnly(e.target.checked);
                emitChange({ verifiedOnly: String(e.target.checked) });
              }}
              className="rounded border-gray-300"
            />
            <span className="text-gray-600">인증매물만</span>
          </label>
        </div>

        <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5">
          초기화
        </button>
      </div>
      </div>
    </div>
  );
}

/* ── 하위 컴포넌트 ── */

type OptionItem = string | { v: string; l: string };

function FilterSelect({
  label, value, onChange, options, className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: OptionItem[];
  className?: string;
}) {
  const id = `filter-${label}`;
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="text-xs text-gray-500 mb-1">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`border border-gray-300 rounded px-2 py-1.5 text-sm bg-white ${className}`}
      >
        {options.map((opt) => {
          const v = typeof opt === "string" ? opt : opt.v;
          const l = typeof opt === "string" ? opt : opt.l;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </div>
  );
}

function FilterInput({
  label, value, onChange, className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const id = `filter-${label}`;
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="text-xs text-gray-500 mb-1">{label}</label>
      <input
        id={id}
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className || "border border-gray-300 rounded px-2 py-1.5 text-sm w-28"}
        placeholder=""
      />
    </div>
  );
}
