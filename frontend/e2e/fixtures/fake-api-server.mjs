/**
 * e2e 전용 가짜 API 서버(세션 483 PR 3b, 설계 v2 O11) — Next 서버가 서버 렌더 때 직접 부르는 요청만 받는다.
 * 브라우저 쪽 요청은 지금처럼 각 spec 의 page.route 가 가로챈다(여기까지 오면 404).
 *
 * 받는 것: GET /api/complexes/{no}/public-summary → public-summary-mocks.mjs 값(없는 번호 = 404) · GET /health → 200 ·
 * GET /api/regions/sitemap-codes · /api/regions/{sgg5}/hub · /api/regions/{sgg5}/dongs/{dong10} → region-mocks.mjs 값(세션 484 PR 3c-1b, 없으면 404).
 * 포트 = env E2E_FAKE_API_PORT(기본 9999 — CI 의 NEXT_PUBLIC_API_URL=http://localhost:9999 와 같은 값).
 * 운영 API·집 서버(8002)에는 아무 요청도 보내지 않는다.
 */
import { createServer } from "node:http";
import { PUBLIC_SUMMARIES } from "./public-summary-mocks.mjs";
import { DONGS, HUBS, SITEMAP_CODES } from "./region-mocks.mjs";

const port = Number(process.env.E2E_FAKE_API_PORT ?? 9999);

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  if (url.pathname === "/health") return send(res, 200, { status: "ok" });
  const m = url.pathname.match(/^\/api\/complexes\/([^/]+)\/public-summary$/);
  if (req.method === "GET" && m) {
    const hit = PUBLIC_SUMMARIES[decodeURIComponent(m[1])];
    return hit ? send(res, 200, hit) : send(res, 404, { detail: "단지를 찾을 수 없습니다" });
  }
  if (req.method === "GET" && url.pathname === "/api/regions/sitemap-codes") return send(res, 200, SITEMAP_CODES);
  const hub = url.pathname.match(/^\/api\/regions\/(\d{5})\/hub$/);
  if (req.method === "GET" && hub) {
    const hit = HUBS[hub[1]];
    return hit ? send(res, 200, hit) : send(res, 404, { detail: "지역을 찾을 수 없습니다" });
  }
  const dong = url.pathname.match(/^\/api\/regions\/(\d{5})\/dongs\/(\d{10})$/);
  if (req.method === "GET" && dong) {
    const hit = dong[2].startsWith(dong[1]) ? DONGS[dong[2]] : null;
    return hit ? send(res, 200, hit) : send(res, 404, { detail: "동을 찾을 수 없습니다" });
  }
  return send(res, 404, { detail: "e2e 가짜 서버에 없는 경로" });
});

// 주소를 안 적으면 IPv4·IPv6 둘 다 받는다 — "localhost" 가 ::1 로 풀려도 닿게
server.listen(port, () => {
  console.log(`[e2e 가짜 API] http://localhost:${port}`);
});
