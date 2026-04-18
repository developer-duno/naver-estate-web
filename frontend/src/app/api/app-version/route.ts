/**
 * 앱 버전 API — VersionWatcher 가 폴링해서 새 배포 감지에 사용.
 *
 * 이 route 는 Vercel 배포마다 고유 buildId 로 고정 빌드됨. 클라이언트가
 * 받은 값이 자기 NEXT_PUBLIC_BUILD_ID 와 다르면 새 배포가 있다는 신호.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-static"; // 배포 시점에 고정 생성
export const revalidate = false;

export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown" },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
