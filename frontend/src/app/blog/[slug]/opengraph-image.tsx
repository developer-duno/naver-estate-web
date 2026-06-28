import { ImageResponse } from "next/og";
import { POSTS, getPostBySlug } from "../posts";

/**
 * 블로그 글 공유 미리보기 이미지 — /blog/[slug]/opengraph-image (PNG 1200×630).
 *
 * 왜 동적 PNG 인가: 화면 표시용 hero(getHeroAsset)는 일부 글이 SVG 라
 * 카카오톡·페이스북 공유 썸네일이 뜨지 않는다(SVG 미지원). 이 라우트가 있으면
 * Next.js 가 og:image/twitter:image 메타를 PNG 로 자동 주입하므로, 모든 글이
 * (현재 + 미래 글, fallback 포함) 자동으로 PNG 썸네일을 갖는다. 홈 opengraph-image
 * 와 동일하게 ImageResponse 기본 폰트로 한글이 정상 렌더됨(라이브 실측 확인).
 *
 * dynamicParams=false 인 [slug] 라우트라 generateStaticParams 로 빌드 시 정적 생성.
 */

export const alt = "2u부동산 블로그";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

/** 카테고리별 강조 색상 — 디자인 변화 + 카테고리 인지. */
const CATEGORY_COLOR: Record<string, string> = {
  "시세 분석": "#3b82f6",
  "세금": "#10b981",
  "도구 활용": "#8b5cf6",
  "미분양": "#f59e0b",
};

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const title = post?.title ?? "2u부동산 블로그";
  const category = post?.category ?? "";
  const accent = CATEGORY_COLOR[category] ?? "#3b82f6";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        {/* 상단: 브랜드 + 카테고리 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "#3b82f6",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: -1,
            }}
          >
            2u
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#1f2937", letterSpacing: -1 }}>
            2u부동산
          </div>
          {category ? (
            <div
              style={{
                marginLeft: 12,
                fontSize: 22,
                fontWeight: 600,
                color: "white",
                background: accent,
                borderRadius: 9999,
                padding: "6px 20px",
                display: "flex",
              }}
            >
              {category}
            </div>
          ) : null}
        </div>

        {/* 중앙: 글 제목 */}
        <div
          style={{
            display: "flex",
            fontSize: 60,
            fontWeight: 700,
            color: "#111827",
            lineHeight: 1.25,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </div>

        {/* 하단: 도메인 + 강조선 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 60, height: 6, background: accent, borderRadius: 9999 }} />
          <div style={{ fontSize: 24, color: "#6b7280" }}>2u.pe.kr/blog</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
