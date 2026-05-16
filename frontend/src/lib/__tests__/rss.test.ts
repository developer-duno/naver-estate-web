/**
 * RSS 2.0 피드 생성 테스트 — escapeXml 5문자 치환 + buildRssFeed 구조·정렬·필터
 */
import { describe, it, expect } from "vitest";
import { escapeXml, buildRssFeed } from "../rss";
import type { BlogPost } from "@/types/blog";

/** 테스트용 BlogPost fixture 팩토리 — 필요한 필드만 override */
function makePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    slug: "sample-post",
    title: "샘플 글",
    description: "샘플 설명",
    date: "2026-05-01",
    category: "도구 활용",
    readingTime: 5,
    ...overrides,
  };
}

const BASE_URL = "https://2u.pe.kr";

describe("escapeXml", () => {
  it("5문자(& < > \" ')를 모두 XML 엔티티로 치환한다", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("`&`를 가장 먼저 치환해 이중 이스케이프(&amp;lt;)가 생기지 않는다", () => {
    // `<`가 `&lt;`로 바뀐 뒤 그 `&`가 다시 치환되면 `&amp;lt;`가 됨 — 그러면 안 됨
    expect(escapeXml("<")).toBe("&lt;");
  });
});

describe("buildRssFeed", () => {
  it("`<rss version=\"2.0\">` + `<channel>` 루트 구조를 만든다", () => {
    const xml = buildRssFeed([makePost()], BASE_URL);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</channel>");
  });

  it("draft:true 글은 item 에서 제외한다", () => {
    const posts = [
      makePost({ slug: "published", title: "발행글" }),
      makePost({ slug: "hidden", title: "초안글", draft: true }),
    ];
    const xml = buildRssFeed(posts, BASE_URL);
    expect(xml).toContain("/blog/published");
    expect(xml).not.toContain("/blog/hidden");
  });

  it("item 수 = 비draft 글 수이고, 발행일 내림차순으로 정렬한다", () => {
    const posts = [
      makePost({ slug: "old", date: "2026-05-01" }),
      makePost({ slug: "new", date: "2026-05-17" }),
      makePost({ slug: "mid", date: "2026-05-08" }),
    ];
    const xml = buildRssFeed(posts, BASE_URL);
    const itemCount = (xml.match(/<item>/g) ?? []).length;
    expect(itemCount).toBe(3);
    // 최신 글(new)이 가장 위에 와야 함
    expect(xml.indexOf("/blog/new")).toBeLessThan(xml.indexOf("/blog/mid"));
    expect(xml.indexOf("/blog/mid")).toBeLessThan(xml.indexOf("/blog/old"));
  });

  it("pubDate 가 RFC822 형식이다", () => {
    const xml = buildRssFeed([makePost({ date: "2026-05-17" })], BASE_URL);
    const match = xml.match(/<pubDate>([^<]+)<\/pubDate>/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} /);
  });

  it("특수문자 포함 title 을 XML escape 해서 출력한다", () => {
    const xml = buildRssFeed(
      [makePost({ title: "양도세 & 취득세 <비교>" })],
      BASE_URL,
    );
    expect(xml).toContain("양도세 &amp; 취득세 &lt;비교&gt;");
    expect(xml).not.toContain("양도세 & 취득세");
  });
});
