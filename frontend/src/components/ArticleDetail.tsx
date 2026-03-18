"use client";

import { useState, useEffect, useRef } from "react";
import { getArticleLive } from "@/lib/api";
import type { Article } from "@/types";
import { M2_TO_PYEONG } from "@/lib/constants";
import { formatDateFull, formatMaintenanceCost } from "@/lib/format";

interface Props {
  articleNo: string;
  onClose: () => void;
}

export default function ArticleDetail({ articleNo, onClose }: Props) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getArticleLive(articleNo)
      .then((data) => { if (!cancelled) setArticle(data); })
      .catch(() => { if (!cancelled) setError("매물 정보를 불러올 수 없습니다."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [articleNo]);

  const dialogRef = useRef<HTMLDivElement>(null);

  // P1-4: 포커스 트랩 + ESC 닫기
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    el.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-detail-title"
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 id="article-detail-title" className="text-lg font-bold">매물 상세</h2>
          <button onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto p-6 max-h-[calc(85vh-64px)] space-y-4">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" role="status" aria-label="로딩 중" />
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-8">
              <p className="text-red-500 mb-3">{error}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setError("");
                  getArticleLive(articleNo)
                    .then(setArticle)
                    .catch(() => setError("매물 정보를 불러올 수 없습니다."))
                    .finally(() => setLoading(false));
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                다시 시도
              </button>
            </div>
          )}

          {!loading && !error && !article && (
            <p className="text-center text-gray-500 py-8">매물 정보를 불러올 수 없습니다.</p>
          )}

          {!loading && article && <ArticleBody article={article} />}
        </div>
      </div>
    </div>
  );
}

function ArticleBody({ article: a }: { article: Article }) {
  const areaM2 = a.area2_m2 || a.area1_m2;
  const pyeong = areaM2 ? Math.round(areaM2 / M2_TO_PYEONG * 10) / 10 : null;

  const price =
    (a.trade_type_name === "월세" || a.trade_type_name === "단기임대")
      ? `${a.deal_or_warrant_prc || "-"} / ${a.rent_prc || "-"}`
      : a.deal_or_warrant_prc || "-";

  return (
    <>
      {/* 기본 정보 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        <Info label="거래유형" value={a.trade_type_name} />
        <Info label="단지명" value={a.complex_name} />
        <Info label="동/층" value={`${a.building_name || "-"} / ${a.floor_info || "-"}`} />
        <Info label={(a.trade_type_name === "월세" || a.trade_type_name === "단기임대") ? "보증금/월세" : "가격"} value={price} />
        {areaM2 && <Info label="전용면적" value={`${areaM2}㎡ (${pyeong}평)`} />}
        {a.area1_m2 && <Info label="공급면적" value={`${a.area1_m2}㎡`} />}
        <Info label="평당가" value={a.price_per_pyeong ? `${a.price_per_pyeong.toLocaleString()}만원` : "-"} />
        <Info label="방향" value={a.direction} />
        <Info label="방/욕실" value={`${a.room_count ?? "-"}/${a.bathroom_count ?? "-"}`} />
        <Info label="입주가능일" value={formatDateFull(a.move_in_date)} />
        <Info label="관리비" value={formatMaintenanceCost(a.maintenance_cost, a.numeric_maintenance_cost)} />
        <Info label="난방방식" value={a.heating_type} />
        <Info label="주차" value={a.parking_count || "-"} />
        <Info label="총층수" value={a.total_floor_count ? String(a.total_floor_count) : "-"} />
        <Info label="총호수" value={a.total_household_count ? `${a.total_household_count}세대` : "-"} />
        <Info label="준공일" value={a.is_presale ? "미준공 (분양권)" : formatDateFull(a.use_approve_ymd)} />
        <Info label="주소" value={a.jibun_address || a.complex_address} />
      </div>

      {/* 특징 */}
      {a.article_feature_desc && (
        <Section title="특징">
          <p className="text-sm text-gray-600">{a.article_feature_desc}</p>
        </Section>
      )}

      {/* 상세설명 */}
      {a.detail_description && (
        <Section title="상세설명">
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{a.detail_description}</p>
        </Section>
      )}

      {/* 태그 */}
      {a.tags && a.tags.length > 0 && (
        <Section title="태그">
          <div className="flex gap-1 flex-wrap">
            {a.tags.map((t) => (
              <span key={t} className="text-xs border border-gray-300 text-gray-600 rounded-full px-2 py-0.5">
                {t}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* 중개사 */}
      <Section title="중개사 정보">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          <Info label="중개사" value={a.realtor_name} />
          <Info label="연락처" value={a.realtor_phone_display} />
          <Info label="주소" value={a.realtor_address} />
        </div>
      </Section>

      {/* 세금 */}
      {(a.acquisition_tax || a.broker_fee) && (
        <Section title="세금/수수료">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <Info label="취득세" value={formatWon(a.acquisition_tax)} />
            <Info label="중개보수" value={formatWon(a.broker_fee)} />
          </div>
        </Section>
      )}

      {/* 외부 링크 */}
      <div className="border-t pt-3 flex flex-col gap-2">
        <a
          href={`https://new.land.naver.com/complexes/${a.complex_no}?articleNo=${a.article_no}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline font-medium"
        >
          네이버 부동산에서 상세보기 →
        </a>
        {a.latitude && a.longitude && (
          <a
            href={`https://map.naver.com/p?lat=${a.latitude}&lng=${a.longitude}&title=${encodeURIComponent(a.complex_name || "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            네이버 지도에서 보기 →
          </a>
        )}
      </div>
    </>
  );
}

/** 원 단위 → 만원 단위 (반올림) */
function formatWon(value?: string | null): string {
  if (!value) return "-";
  const num = parseFloat(value);
  if (isNaN(num) || num < 0) return "-";
  if (num === 0) return "0원";
  const manwon = Math.round(num / 10000);
  if (manwon >= 10000) {
    const eok = Math.floor(manwon / 10000);
    const remainder = manwon % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}만원` : `${eok}억원`;
  }
  return manwon.toLocaleString() + "만원";
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <span className="text-sm text-gray-500 font-medium text-center">{label}</span>
      <span className="text-sm text-center">{value || "-"}</span>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-3">
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      {children}
    </div>
  );
}

