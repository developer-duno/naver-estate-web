"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { getArticle } from "@/lib/api";
import type { Article } from "@/types";
import { M2_TO_PYEONG } from "@/lib/constants";

interface Props {
  articleNo: string;
  onClose: () => void;
}

export default function ArticleDetail({ articleNo, onClose }: Props) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    getArticle(articleNo)
      .then(setArticle)
      .catch(() => setError("매물 정보를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, [articleNo]);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-detail-title"
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 id="article-detail-title" className="text-lg font-bold">매물 상세 — {articleNo}</h2>
          <button onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto p-6 max-h-[calc(85vh-64px)] space-y-4">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          )}

          {!loading && error && (
            <p className="text-center text-red-500 py-8">{error}</p>
          )}

          {!loading && !error && !article && (
            <p className="text-center text-gray-400 py-8">매물 정보를 불러올 수 없습니다.</p>
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
    a.trade_type_name === "월세"
      ? `${a.deal_or_warrant_prc || "-"} / ${a.rent_prc || "-"}`
      : a.deal_or_warrant_prc || "-";

  return (
    <>
      {/* 기본 정보 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        <Info label="거래유형" value={a.trade_type_name} />
        <Info label="단지명" value={a.complex_name} />
        <Info label="동/층" value={`${a.building_name || "-"} / ${a.floor_info || "-"}`} />
        <Info label={a.trade_type_name === "월세" ? "보증금/월세" : "가격"} value={price} />
        {areaM2 && <Info label="전용면적" value={`${areaM2}㎡ (${pyeong}평)`} />}
        {a.area1_m2 && <Info label="공급면적" value={`${a.area1_m2}㎡`} />}
        <Info label="평당가" value={a.price_per_pyeong ? `${a.price_per_pyeong.toLocaleString()}만원` : "-"} />
        <Info label="방향" value={a.direction} />
        <Info label="방/욕실" value={`${a.room_count ?? "-"}/${a.bathroom_count ?? "-"}`} />
        <Info label="입주가능일" value={formatDate(a.move_in_date)} />
        <Info label="관리비" value={a.maintenance_cost ? `${a.maintenance_cost}만원` : "-"} />
        <Info label="난방방식" value={a.heating_type} />
        <Info label="주차" value={a.parking_count || "-"} />
        <Info label="총층수" value={a.total_floor_count ? String(a.total_floor_count) : "-"} />
        <Info label="준공일" value={a.is_presale ? "미준공 (분양권)" : formatDate(a.use_approve_ymd)} />
        <Info label="주소" value={a.jibun_address} />
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
            <Info label="취득세" value={a.acquisition_tax} />
            <Info label="중개보수" value={a.broker_fee} />
          </div>
        </Section>
      )}

      {/* 사진 */}
      {a.photo_urls && a.photo_urls.length > 0 && (
        <Section title={`사진 (${a.photo_urls.length}장)`}>
          <div className="flex gap-2 flex-wrap">
            {a.photo_urls.slice(0, 6).map((url, i) => (
              <Image key={url} src={url} alt={`매물 사진 ${i + 1}`} width={128} height={96} className="w-32 h-24 object-cover rounded border" unoptimized />
            ))}
          </div>
        </Section>
      )}

      {/* 지도 링크 */}
      {a.latitude && a.longitude && (
        <div className="pt-2">
          <a
            href={`https://map.naver.com/p?lat=${a.latitude}&lng=${a.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            네이버 지도에서 보기 →
          </a>
        </div>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <span className="text-sm text-gray-500 font-medium">{label}</span>
      <span className="text-sm">{value || "-"}</span>
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

function formatDate(d?: string | null): string {
  if (!d) return "-";
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  return d;
}
