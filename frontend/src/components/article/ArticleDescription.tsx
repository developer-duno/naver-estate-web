"use client";

import type { Article } from "@/types";
import { formatDateFull, formatWon } from "@/lib/format";

interface Props {
  article: Article;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-3">
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      {children}
    </div>
  );
}

export default function ArticleDescription({ article: a }: Props) {
  const photoCount = a.photo_urls?.length ?? 0;

  return (
    <div className="space-y-3">
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

      {/* 사진 링크 */}
      {(a.representative_img_url || photoCount > 0) && (
        <Section title="사진">
          <div className="flex gap-3 text-sm">
            {a.representative_img_url && (
              <a href={a.representative_img_url} target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:underline">대표 사진 보기 →</a>
            )}
            {photoCount > 0 && (
              <a href={a.photo_urls![0]} target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:underline">사진 {photoCount}장 보기 →</a>
            )}
          </div>
        </Section>
      )}

      {/* 중개사 */}
      {a.realtor_name && (
        <Section title="중개사 정보">
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">중개사</span><span>{a.realtor_name}</span>
            </div>
            {a.realtor_phone_display && (
              <div className="flex justify-between">
                <span className="text-gray-500">연락처</span><span>{a.realtor_phone_display}</span>
              </div>
            )}
            {a.realtor_address && (
              <div className="flex justify-between">
                <span className="text-gray-500">주소</span><span className="text-right ml-4">{a.realtor_address}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 세금/수수료 */}
      {(a.acquisition_tax || a.broker_fee) && (
        <Section title="세금/수수료">
          <div className="text-sm space-y-1">
            {a.acquisition_tax && (
              <div className="flex justify-between">
                <span className="text-gray-500">취득세</span><span>{formatWon(a.acquisition_tax)}</span>
              </div>
            )}
            {a.broker_fee && (
              <div className="flex justify-between">
                <span className="text-gray-500">중개보수</span><span>{formatWon(a.broker_fee)}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 메타 정보 */}
      <div className="border-t pt-3 text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
        {a.article_confirm_ymd && <span>확인일자 {formatDateFull(a.article_confirm_ymd)}</span>}
        {a.first_seen_at && <span>최초등록 {a.first_seen_at.slice(0, 10)}</span>}
        {a.last_seen_at && <span>마지막확인 {a.last_seen_at.slice(0, 10)}</span>}
      </div>

      {/* 외부 링크 */}
      <div className="border-t pt-3 flex flex-col gap-2">
        <a href={`https://new.land.naver.com/complexes/${a.complex_no}?articleNo=${a.article_no}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline font-medium">
          네이버 부동산에서 상세보기 →
        </a>
        {a.latitude && a.longitude && (
          <a href={`https://map.naver.com/p?lat=${a.latitude}&lng=${a.longitude}&title=${encodeURIComponent(a.complex_name ?? "")}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
            네이버 지도에서 보기 →
          </a>
        )}
      </div>
    </div>
  );
}
