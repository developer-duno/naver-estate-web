"use client";

import { useRef, useEffect, useState } from "react";
import type { MbApartment } from "@/types";

const SDK_POLL_INTERVAL = 200;
const SDK_POLL_TIMEOUT = 5000;

interface Props {
  apartments: MbApartment[];
  /** 선택된 단지 id (지도 밖 선택카드와 동기화). 마커 클릭 시 onSelect 로 갱신됨. */
  selectedId?: string;
  /** 마커 클릭 콜백 — 부모가 선택카드 렌더에 사용 */
  onSelect?: (apt: MbApartment) => void;
}

/** 좌표(위·경도)가 둘 다 있는 단지만 지도에 찍을 수 있다.
 * 0,0(좌표 미상을 0으로 채운 데이터)은 아프리카 앞바다라 제외 — 한국 좌표는 위도 33~38, 경도 124~132. */
function hasCoords(apt: MbApartment): apt is MbApartment & { latitude: number; longitude: number } {
  return (
    typeof apt.latitude === "number" &&
    typeof apt.longitude === "number" &&
    apt.latitude !== 0 &&
    apt.longitude !== 0
  );
}

/** InfoWindow 텍스트 이스케이프 — 단지명에 꺾쇠·따옴표가 있어도 HTML 주입 차단 (XSS). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 미분양/분양 단지 다중 마커 지도 (현재 페이지 단지 50개 표시).
 * 단일 마커 MbLocationMap 패턴 답습(SDK 폴링·에러분기·cleanup)을 다중 마커로 확장.
 * 마커 클릭 → InfoWindow(단지명만) + onSelect(apt). 상세 링크는 부모의 선택카드가 담당
 * (naver InfoWindow 는 HTML 문자열 기반이라 router.push 직접 연결 불가 + XSS 회피).
 */
export default function MbClusterMap({ apartments, onSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<naver.maps.Map | null>(null);
  const markersRef = useRef<naver.maps.Marker[]>([]);
  const infoWindowRef = useRef<naver.maps.InfoWindow | null>(null);
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState(false);

  // 최신 onSelect 를 ref 로 유지 — 마커 리스너가 stale 콜백을 부르지 않도록 (마커 재생성 최소화).
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const coordItems = apartments.filter(hasCoords);

  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;

    const clearMarkers = () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      infoWindowRef.current?.close();
    };

    const init = () => {
      if (cancelled || !mapRef.current || !window.naver?.maps) return;
      try {
        clearMarkers();

        // 좌표 있는 단지가 없으면 기본 중심(서울시청)으로 지도만 띄움 — 빈 안내는 부모/아래 분기에서.
        const fallbackCenter = new naver.maps.LatLng(37.5666, 126.9784);
        const map =
          mapInstanceRef.current ??
          new naver.maps.Map(mapRef.current, {
            center: fallbackCenter,
            zoom: 12,
            zoomControl: true,
          });
        mapInstanceRef.current = map;

        const infoWindow =
          infoWindowRef.current ??
          new naver.maps.InfoWindow({ borderWidth: 0, disableAnchor: false });
        infoWindowRef.current = infoWindow;

        if (coordItems.length === 0) return;

        const bounds = new naver.maps.LatLngBounds();
        coordItems.forEach((apt) => {
          const pos = new naver.maps.LatLng(apt.latitude, apt.longitude);
          bounds.extend(pos);
          const marker = new naver.maps.Marker({ position: pos, map, title: apt.name });
          naver.maps.Event.addListener(marker, "click", () => {
            infoWindow.setContent(
              `<div style="padding:6px 10px;font-size:13px;font-weight:600;white-space:nowrap;">${escapeHtml(apt.name)}</div>`,
            );
            infoWindow.open(map, marker);
            onSelectRef.current?.(apt);
          });
          markersRef.current.push(marker);
        });

        // 단지 1개면 fitBounds 가 과도하게 확대 → setCenter+적정 줌으로.
        if (coordItems.length === 1) {
          map.setCenter(new naver.maps.LatLng(coordItems[0].latitude, coordItems[0].longitude));
          map.setZoom(15);
        } else {
          map.fitBounds(bounds);
        }
      } catch {
        setError(true);
      }
    };

    if (window.naver?.maps) {
      init();
    } else {
      const start = Date.now();
      const poll = setInterval(() => {
        if (window.naver?.maps) {
          clearInterval(poll);
          init();
        } else if (Date.now() - start > SDK_POLL_TIMEOUT) {
          clearInterval(poll);
          if (!cancelled) setError(true);
        }
      }, SDK_POLL_INTERVAL);
      return () => {
        cancelled = true;
        clearInterval(poll);
        clearMarkers();
      };
    }

    return () => {
      cancelled = true;
      clearMarkers();
    };
    // coordItems 는 apartments 파생 — apartments 변경 시에만 마커 재생성.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartments]);

  // 언마운트 시 지도 인스턴스 정리
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      mapInstanceRef.current = null;
    };
  }, []);

  if (error) {
    return (
      <div
        className="w-full h-96 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center"
        role="status"
      >
        <p className="text-sm text-gray-500">지도를 불러오지 못했습니다.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className="w-full h-96 rounded-lg border border-gray-200"
        aria-label="단지 위치 지도"
      />
      {coordItems.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg"
          role="status"
        >
          <p className="text-sm text-gray-500">표시할 위치 정보가 있는 단지가 없어요.</p>
        </div>
      )}
    </div>
  );
}
