/**
 * StructuredData 단위 테스트 — BlogPosting JSON-LD 헬퍼
 * 실행: npx vitest run src/components/__tests__/StructuredData.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BlogPostingJsonLd } from "@/components/StructuredData";

/** 렌더 후 ld+json script 의 textContent 를 파싱해 객체로 반환 */
function renderJsonLd(props: Parameters<typeof BlogPostingJsonLd>[0]) {
  const { container } = render(<BlogPostingJsonLd {...props} />);
  const script = container.querySelector(
    'script[type="application/ld+json"]',
  );
  expect(script).not.toBeNull();
  return JSON.parse(script!.textContent ?? "{}");
}

const BASE_PROPS = {
  headline: "전세가율 계산법과 활용",
  description: "전세가율 한 번에 이해.",
  image: "https://2u.pe.kr/blog-hero/jeonse-ratio.webp",
  datePublished: "2026-05-02",
  url: "https://2u.pe.kr/blog/jeonse-ratio",
  articleSection: "시세 분석",
};

describe("BlogPostingJsonLd — 정상 케이스", () => {
  it("BlogPosting 타입 + 필드 매핑 + Organization author/publisher", () => {
    const data = renderJsonLd(BASE_PROPS);
    expect(data["@type"]).toBe("BlogPosting");
    expect(data["@context"]).toBe("https://schema.org");
    expect(data.headline).toBe(BASE_PROPS.headline);
    expect(data.description).toBe(BASE_PROPS.description);
    expect(data.image).toBe(BASE_PROPS.image);
    expect(data.articleSection).toBe("시세 분석");
    expect(data.inLanguage).toBe("ko-KR");
    expect(data.author["@type"]).toBe("Organization");
    expect(data.publisher["@type"]).toBe("Organization");
    expect(data.author.name).toBe("2u부동산");
    // organization.url 은 SITE_URL 상수(constants.ts) — 운영 도메인으로 채워짐
    expect(data.publisher.url).toBe("https://2u.pe.kr");
    expect(data.mainEntityOfPage["@id"]).toBe(BASE_PROPS.url);
    expect(data.mainEntityOfPage["@type"]).toBe("WebPage");
  });
});

describe("BlogPostingJsonLd — 엣지 케이스", () => {
  it("dateModified 미전달 시 datePublished 로 fallback", () => {
    const data = renderJsonLd(BASE_PROPS);
    expect(data.dateModified).toBe(BASE_PROPS.datePublished);
  });

  it("dateModified 전달 시 그 값을 사용", () => {
    const data = renderJsonLd({ ...BASE_PROPS, dateModified: "2026-05-15" });
    expect(data.dateModified).toBe("2026-05-15");
    expect(data.datePublished).toBe("2026-05-02");
  });

  it("image 는 절대 URL (https:// 시작)", () => {
    const data = renderJsonLd(BASE_PROPS);
    expect(data.image).toMatch(/^https:\/\//);
  });

  it("JSON.parse 가 throw 없이 파싱됨", () => {
    const { container } = render(<BlogPostingJsonLd {...BASE_PROPS} />);
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(() => JSON.parse(script!.textContent ?? "")).not.toThrow();
  });

  it("description 의 </script> 가 이스케이프되어 태그 조기 종료 안 됨", () => {
    const data = renderJsonLd({
      ...BASE_PROPS,
      description: "위험 문자열 </script><script>x</script>",
    });
    // 파싱 후 원본 문자열은 그대로 복원됨
    expect(data.description).toBe("위험 문자열 </script><script>x</script>");
    // 직렬화 결과(textContent)에는 raw </script> 가 없어야 함
    const { container } = render(
      <BlogPostingJsonLd
        {...BASE_PROPS}
        description="위험 문자열 </script><script>x</script>"
      />,
    );
    const raw =
      container.querySelector('script[type="application/ld+json"]')
        ?.textContent ?? "";
    expect(raw).not.toContain("</script>");
    expect(raw).toContain("\\u003c");
  });
});
