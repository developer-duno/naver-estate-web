# SEO 메타·OG 이미지 규칙 (Next.js App Router)

검색엔진·SNS 공유가 페이지를 제대로 읽도록 막힌 곳을 뚫는 규칙. 세션 336 검색·공유
노출 진단(PR #260)에서 도출. 순위·노출은 누구도 보장 못 하며, 여기 범위는 "봇·크롤러가
못 읽거나 잘못 읽는 기술적 막힘 제거"까지다.

## 룰 1 — og:image 는 PNG/JPG, SVG 금지 (카톡·페북 미지원)

SVG og:image 는 카카오톡·페이스북이 썸네일을 못 띄운다. og:image 는 반드시
PNG/JPG/GIF. 화면 표시용 hero 이미지는 SVG 여도 무방(브라우저는 렌더)하니,
**화면 hero(SVG 가능)와 og:image(PNG 필수)를 분리**한다.

- 선례: `app/opengraph-image.tsx`(root 브랜드 PNG), `app/blog/[slug]/opengraph-image.tsx`
  (글별 동적 PNG). `ImageResponse`(next/og)는 Vercel 기본 폰트로 **한글 정상 렌더**
  (세션 336 라이브·빌드 PNG 픽셀 실측 확정 — 별도 폰트 로드 불필요).
- 화면 hero 는 `lib/blog-hero.ts` `getHeroAsset`(SVG 혼재) 유지, og 와 분리.

## 룰 2 — openGraph 객체 직접 지정 시 root opengraph-image 자동 상속이 끊긴다 ⚠️

가장 잘 빠지는 함정. Next.js 의 file-based `opengraph-image.tsx` 는 **폴더 트리 아래로
상속**되지만(공식문서: "more specific image takes precedence over any above it"),
**그 페이지의 metadata/generateMetadata 가 `openGraph` 객체를 직접 지정하면(images 없이
title/description 만 적어도) root opengraph-image 자동 상속이 끊겨 og:image 가 아예
빠진다**(세션 336 빌드 산출물 실측 확정 — 공식문서엔 명시 안 됨, 실측으로만 드러남).

### 답습 (의무)

- **자체 `openGraph` 를 지정하는 페이지는 `images` 도 반드시 명시**한다. 글별 이미지가
  없으면 root 브랜드 PNG 를 가리킨다:
  ```ts
  openGraph: {
    title: "...", description: "...", type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
  ```
  `metadataBase`(root layout)가 상대경로 `/opengraph-image` 를 절대 URL 로 변환한다.
- 글별 동적 og 가 필요하면 그 라우트에 `opengraph-image.tsx` 를 두고, generateMetadata
  의 `openGraph.images` 는 **생략**한다(동적 라우트가 자동 주입 — 중복 지정 금지).
- 선례: blog 목록·pricing·tools 6종이 openGraph 만 지정하고 images 를 빠뜨려 og:image 가
  통째로 없던 것을 세션 336 에서 전수 보강.

### 검증법 (성공 단정 전 의무)

`npm run build` 후 빌드 산출물에서 직접 확인 — 코드만 보면 상속 끊김을 못 잡는다:
```bash
grep -oE '<meta property="og:image" content="[^"]*"' .next/server/app/<page>.html
# 없으면 = og:image 누락. 모든 자체-openGraph 페이지에 대해 확인.
```

## 룰 3 — 클라이언트 본문을 Suspense 로 통째 감싸면 봇 첫 HTML 이 빈다

`useSearchParams`/`usePathname` 등을 쓰는 클라이언트 컴포넌트는 Next.js 가 Suspense
경계를 강제한다. 이때 **정적 텍스트(h1·소개)까지 같은 Suspense 안에 두면, 봇이 받는
첫 HTML 이 fallback(skeleton)뿐이라 h1·본문이 빈다**(세션 336 홈 실측 — `<h1>` 0개).

### 답습

- **정적 텍스트(h1·hero·소개)는 Suspense 밖**에, useSearchParams 쓰는 동적 컴포넌트만
  Suspense 안에 둔다. `"use client"` + useQuery 컴포넌트여도 정적 JSX 는 서버가 첫
  HTML 로 렌더하므로(QueryClientProvider 안이면 안전, suspense:false 기본) Suspense 밖
  배치 OK. 선례: `app/page.tsx` HomeHeader 를 Suspense 밖으로 분리.

### 검증법

```bash
curl -sL -A "Googlebot" https://<도메인>/ | grep -c '<h1'   # 1 이상이어야
```
빌드 산출물 `.next/server/app/index.html` 에서 h1·본문 문구 직접 확인.

## 룰 4 — sitemap lastModified 는 빌드시각(new Date()) 금지, 실제 수정일

정적 페이지 lastModified 를 `new Date()`(빌드 시각)로 두면 콘텐츠가 안 바뀌어도 매 배포
"수정됨"으로 찍혀 검색엔진이 lastmod 신뢰를 거둔다. **고정 날짜 상수**로 두고 실제
개편 시에만 손으로 갱신. blog 글은 발행일(`p.date`) 사용. 선례: `app/sitemap.ts`
`STATIC_PAGE_LASTMOD`.

## 룰 5 — 의도된 봇 차단과 노출은 구분 (B2B 구독 데이터)

`/complex/`·`/mibunyang/`·`/search` 의 robots.txt 차단 + noindex 는 **B2B 구독자 전용
데이터 보호로 의도된 설계**(robots.ts). 진단·수정 시 이를 "결함"으로 오판하지 말 것.
마케팅·공개 페이지(홈·blog·tools·pricing)만 색인 대상.

## Cross-link

- `web-rules.md` — React/Next.js 코딩 규칙 (본 룰과 상보)
- `app/opengraph-image.tsx` · `app/blog/[slug]/opengraph-image.tsx` — PNG og 선례
- `app/robots.ts` · `app/sitemap.ts` · `app/feed.xml/route.ts` — 크롤 자산
- 글로벌 메모리 `[[session336-summary]]` — 진단·수정 전말
