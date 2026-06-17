"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { MbApartment } from "@/types";
import { normalizePp } from "@/lib/mb-format";

/** 지도에서 마커 클릭 시 선택된 단지 요약 카드 (지도 아래 렌더).
 * naver InfoWindow 는 HTML 문자열 기반이라 router.push 직접 연결 불가 →
 * 상세 링크는 이 React 카드의 onClick 으로 안전하게 처리(XSS·hydration 회피). */
export default function MbSelectedCard({
  apt,
  onClose,
}: {
  apt: MbApartment;
  onClose?: () => void;
}) {
  const router = useRouter();
  const pp = normalizePp(apt.presale_pp);

  return (
    <div className="mt-3 bg-white rounded-lg border border-blue-200 shadow-sm p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="font-semibold text-blue-700 truncate">{apt.name}</p>
          <p className="text-xs text-gray-500">
            {apt.region} {apt.gu ?? ""}
            {apt.presale_type && <span className="ml-1 text-gray-400">· {apt.presale_type}</span>}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-none"
            aria-label="선택 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-2.5">
        {apt.competition_rate != null && (
          <span className="font-semibold text-purple-700">경쟁률 {apt.competition_rate.toLocaleString()}:1</span>
        )}
        {pp != null && <span className="text-amber-700">평당 {apt.presale_pp!.toLocaleString()}만</span>}
        {apt.presale_min_price != null && (
          <span className="text-gray-600">분양가(최저) {apt.presale_min_price.toLocaleString()}만</span>
        )}
        {apt.units != null && <span className="text-gray-500">{apt.units.toLocaleString()}세대</span>}
        {apt.unsold != null && apt.unsold > 0 && (
          <span className="text-red-600">미분양 {apt.unsold.toLocaleString()}</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => router.push(`/mibunyang/${apt.id}`)}
        className="w-full sm:w-auto px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
      >
        상세보기
      </button>
    </div>
  );
}
