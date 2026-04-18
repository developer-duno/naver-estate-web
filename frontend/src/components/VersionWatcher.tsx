"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 배포 버전 감시기 — 새 배포 도착 시 사용자에게 안내 + 자동 리로드.
 *
 * 동작:
 *  1. 마운트 시 현재 번들의 NEXT_PUBLIC_BUILD_ID 를 myBuildId 로 기억
 *  2. 60초마다 /api/app-version 폴링 → 새 배포의 buildId 받음
 *  3. 다르면 하단 배너 표시. 클릭 또는 10초 후 자동 location.reload()
 *
 * 이 구조는 "배포 직후 사용자가 옛 번들을 쓰고 있을 때" 한 번 F5 필요하던
 * 문제를 자동화. 사용자는 Ctrl+Shift+R 같은 수동 조작 불필요.
 */
const POLL_INTERVAL_MS = 60_000;
const AUTO_RELOAD_DELAY_MS = 10_000;

export default function VersionWatcher() {
  const myBuildId = useRef<string | null>(null);
  const [newBuildId, setNewBuildId] = useState<string | null>(null);

  useEffect(() => {
    // 클라이언트 버전 확정 (초기 마운트 시점만)
    myBuildId.current = process.env.NEXT_PUBLIC_BUILD_ID ?? null;
    if (!myBuildId.current || myBuildId.current === "unknown") {
      // dev 또는 빌드 ID 미주입 환경 — 감시 비활성
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/app-version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (cancelled) return;
        if (data.buildId && data.buildId !== myBuildId.current) {
          setNewBuildId(data.buildId);
        }
      } catch {
        // 네트워크 일시 실패는 무시
      }
    };

    const id = setInterval(check, POLL_INTERVAL_MS);
    // 초기 1회는 탭 포커스 복귀 직후 시점과 동일하게 느껴지도록 약간 지연
    const initial = setTimeout(check, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(initial);
    };
  }, []);

  // 새 배포 감지 시 자동 리로드 예약
  useEffect(() => {
    if (!newBuildId) return;
    const timer = setTimeout(() => {
      window.location.reload();
    }, AUTO_RELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [newBuildId]);

  if (!newBuildId) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow-lg"
    >
      <p className="font-medium">새 버전이 배포됐어요</p>
      <p className="mt-1 text-amber-800">
        잠시 후 자동으로 새로고침됩니다. 지금 바로 적용하려면 아래 버튼을 눌러주세요.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 rounded bg-amber-600 px-3 py-1 text-white hover:bg-amber-700"
      >
        지금 새로고침
      </button>
    </div>
  );
}
