/**
 * 앱 버전 API — VersionWatcher 가 폴링해서 새 배포 감지에 사용.
 *
 * 배포마다 Vercel 이 process.env.NEXT_PUBLIC_BUILD_ID 를 새 값으로 주입하고
 * 이 route 는 그 값을 런타임에 그대로 반환. 클라이언트가 받은 값이 자기
 * (빌드타임에 고정된) NEXT_PUBLIC_BUILD_ID 와 다르면 새 배포가 있다는 신호.
 *
 * dynamic="force-dynamic" 으로 매 요청마다 실행 — 정적 prerender 되면
 * .rsc 만 빌드되고 일반 GET URL 이 404 나는 문제를 피한다.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown" },
    {
      headers: {
        "Cache-Control": "no-store",
        // Vercel Edge 는 Cache-Control 만으로는 캐시를 끄지 않음 —
        // CDN 전용 지시자로 명시해야 매 요청이 오리진까지 도달.
        // 참고: https://vercel.com/docs/edge-cache#cdn-cache-control
        "Vercel-CDN-Cache-Control": "no-store",
      },
    },
  );
}
