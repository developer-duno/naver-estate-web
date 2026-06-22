"use client";

import { useEffect, useRef, useState } from "react";

export type GeoStatus = "idle" | "prompt" | "granted" | "denied" | "unavailable";

export interface GeoCoords {
  lat: number;
  lng: number;
}

const GEO_TIMEOUT_MS = 8000;

/**
 * 브라우저 현재 위치(GPS) 1회 조회 훅.
 * - `enabled` true 가 될 때 1회만 getCurrentPosition 요청 (위치 권한 팝업을 그 시점에만 띄움).
 * - SSR/미지원 환경 안전(typeof navigator). 거부·타임아웃·에러 시 coords=null + status 갱신.
 * - useMbViewMode 등 기존 훅의 SSR 안전 패턴 답습.
 */
export function useGeolocation(enabled: boolean): { coords: GeoCoords | null; status: GeoStatus } {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!enabled || requestedRef.current) return;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // 미지원 환경은 마운트 1회 상태 확정 — cascading 경고는 의도된 1회 동기 setState 라 억제.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("unavailable");
      return;
    }

    requestedRef.current = true;
    setStatus("prompt");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("granted");
      },
      () => {
        // 거부·타임아웃·위치확인 실패 모두 폴백(전국)으로 — 세부 코드 구분 불필요.
        setCoords(null);
        setStatus("denied");
      },
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 60_000 },
    );
  }, [enabled]);

  return { coords, status };
}
