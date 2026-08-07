"use client";

import { useRef, useEffect, useState } from "react";
import type { MbApartment } from "@/types";
import type { GeoCoords } from "@/hooks/useGeolocation";
import { markerLabel, type MarkerKind } from "@/lib/mb-marker-label";

const SDK_POLL_INTERVAL = 200;
const SDK_POLL_TIMEOUT = 5000;

interface Props {
  apartments: MbApartment[];
  /** 마커 클릭 콜백 — 부모가 선택카드 렌더에 사용 */
  onSelect?: (apt: MbApartment) => void;
  /** 접속자 현재 위치(GPS). 있으면 지도 중심을 내 위치로 (region 미선택 시). */
  userLocation?: GeoCoords | null;
  /** 지역(시/도) 선택 여부 — true 면 그 지역 단지로 fitBounds(명시 선택 우선, GPS 무시). */
  regionSelected?: boolean;
  /** 마커 라벨 종류 — 탭별 핵심 지표(분양가/경쟁률/미분양). 기본 unsold. */
  markerKind?: MarkerKind;
  /** 지도 컨테이너 외부 className — 2단계 풀스크린 시 높이 주입용. 기본 "h-96". */
  className?: string;
}

/** region 미선택 + GPS 허용 시 내 위치 중심 줌 레벨 (전국보다 좁고 동네보다 넓게).
 * 12 = 시/군 단위(화면 반경 ~7km). 세션 318 실측(분양 728단지 좌표 vs 주요 GPS 거점):
 * 서울 42 / 부산 28 / 대전 20개가 줌12 화면에 들어옴 — 대도시는 충분. 지방(춘천 1개)은
 * 분양 자체가 희소해 줌을 낮춰도 효과 0. 11로 낮추면 대도시 마커 과밀(서울 148)로 식별성↓.
 * → 12 가 균형점(실증). 마커는 전국이 다 그려져 빈 지도 아님(줌아웃하면 더 보임). */
const USER_LOCATION_ZOOM = 12;

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

/** InfoWindow/마커 텍스트 이스케이프 — 단지명에 꺾쇠·따옴표가 있어도 HTML 주입 차단 (XSS). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 호갱노노식 가격 말풍선 마커 HTML — 탭별 핵심 지표를 핀 위에 직접 표시.
 * 라벨이 단지명(가격 정보 없음)이면 회색, 가격/지표면 파란 말풍선으로 시각 구분.
 * 라벨은 markerLabel 이 안전한 텍스트만 만들지만 단지명이 섞일 수 있어 escapeHtml 로 XSS 방어. */
function buildMarkerContent(apt: MbApartment, kind: MarkerKind): string {
  const label = markerLabel(apt, kind);
  const isName = label === apt.name; // 가격 정보 없어 단지명 폴백 → 회색 톤
  const bg = isName ? "#6b7280" : "#2563eb";
  return (
    `<div style="transform:translate(-50%,-100%);white-space:nowrap;` +
    `background:${bg};color:#fff;font-size:12px;font-weight:700;` +
    `padding:3px 8px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.3);` +
    `border:1px solid rgba(255,255,255,.7);">${escapeHtml(label)}</div>`
  );
}

/**
 * 미분양/분양 단지 다중 마커 지도 (현재 페이지 단지 50개 표시).
 * 단일 마커 MbLocationMap 패턴 답습(SDK 폴링·에러분기·cleanup)을 다중 마커로 확장.
 * 마커 클릭 → InfoWindow(단지명만) + onSelect(apt). 상세 링크는 부모의 선택카드가 담당
 * (naver InfoWindow 는 HTML 문자열 기반이라 router.push 직접 연결 불가 + XSS 회피).
 */
export default function MbClusterMap({
  apartments,
  onSelect,
  userLocation,
  regionSelected,
  markerKind = "unsold",
  className,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<naver.maps.Map | null>(null);
  const markersRef = useRef<naver.maps.Marker[]>([]);
  const infoWindowRef = useRef<naver.maps.InfoWindow | null>(null);
  const onSelectRef = useRef(onSelect);
  // GPS 좌표 도착 시 카메라를 내 위치로 1회만 옮기기 위한 가드 — 사용자가 이미 지도를 조작했다면
  // 늦게 도착한 GPS 응답이 화면을 강제로 끌어당기지 않도록 (한 번 센터링하면 true 로 잠금).
  const didCenterOnGpsRef = useRef(false);
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
          // 호갱노노식 HTML 가격 말풍선 마커 (기본 핀 대신 icon.content). anchor 는
          // 말풍선 자체가 transform translate(-50%,-100%) 로 꼭지를 좌표에 맞추므로 (0,0).
          const marker = new naver.maps.Marker({
            position: pos,
            map,
            title: apt.name,
            icon: {
              content: buildMarkerContent(apt, markerKind),
              anchor: new naver.maps.Point(0, 0),
            },
          });
          naver.maps.Event.addListener(marker, "click", () => {
            // 클릭 즉시 정보 — 단지명 + 지역 + 핵심 지표. 마커가 가격 없어 단지명만 보일 때
            // (label===name) InfoWindow 까지 단지명만 띄우면 회색 마커와 흰 말풍선에 같은 이름이
            // 겹쳐 보인다 → 지역(시도+구)을 항상 함께 표시해 중복 대신 더 자세한 정보로 만든다.
            const label = markerLabel(apt, markerKind);
            const sub = label === apt.name ? "" : `<div style="font-size:13px;font-weight:700;color:#2563eb;">${escapeHtml(label)}</div>`;
            const area = [apt.region, apt.gu].filter(Boolean).join(" ");
            const areaLine = area ? `<div style="font-size:12px;color:#6b7280;">${escapeHtml(area)}</div>` : "";
            infoWindow.setContent(
              `<div style="padding:6px 10px;white-space:nowrap;">` +
                `<div style="font-size:13px;font-weight:600;">${escapeHtml(apt.name)}</div>` +
                areaLine +
                sub +
                `</div>`,
            );
            infoWindow.open(map, marker);
            onSelectRef.current?.(apt);
          });
          markersRef.current.push(marker);
        });

        // 근본 원인(세션351 실측): page.tsx 와 부모 MbApartmentsTab.tsx 가 useMbViewMode()
        // 를 각각 독립 호출해 서로 다른 state 인스턴스를 갖는다. 자식(이 컴포넌트)이 지도
        // 모드로 판정해 naver.maps.Map 을 생성하는 순간에도, 부모가 부여해야 할 풀스크린
        // 높이 클래스(h-[calc(100vh-56px)] 등)는 아직 브라우저가 실제 레이아웃으로 계산하기
        // 전일 수 있다 — 그 찰나에 컨테이너 높이가 0~1px 인 채로 지도가 생성되면 네이버
        // SDK 가 그 크기를 내부에 스냅샷해버려 이후 컨테이너가 커져도 자동 갱신되지 않는다.
        // "resize" 이벤트 트리거는 이 프로젝트에서 이미 실측으로 무효였다(SearchClusterMap.tsx
        // 세션 349, PR #314/#316 — trigger(map,"resize") 무효, trigger(map,"idle") 만 유효
        // 확인). requestAnimationFrame 으로 다음 페인트 이후(레이아웃 확정 후) idle 이벤트를
        // 명시 트리거해 지도가 실제 컨테이너 크기로 다시 계산하도록 강제한다.
        requestAnimationFrame(() => {
          if (!cancelled) naver.maps.Event.trigger(map, "idle");
        });

        // 지도 중심·줌 우선순위: ① region 선택 → 그 지역 fitBounds(명시 선택 우선)
        // ② region 미선택 + GPS 허용 → 내 위치 중심 + 적정 줌 ③ 그 외 → 전국 fitBounds 폴백.
        if (!regionSelected && userLocation) {
          map.setCenter(new naver.maps.LatLng(userLocation.lat, userLocation.lng));
          map.setZoom(USER_LOCATION_ZOOM);
          didCenterOnGpsRef.current = true;
        } else if (coordItems.length === 1) {
          // 단지 1개면 fitBounds 가 과도하게 확대 → setCenter+적정 줌으로.
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

  // GPS 좌표는 비동기로 늦게 도착 → 마커 재생성 없이 카메라만 내 위치로 이동.
  // region 선택 시엔 무시(명시 선택 우선). 좌표 도착 시 단 1회만 setCenter —
  // 이미 센터링했거나(didCenterOnGpsRef) 사용자가 그 사이 지도를 조작했어도 강제로 끌어오지 않음.
  useEffect(() => {
    if (regionSelected || !userLocation || !mapInstanceRef.current) return;
    if (didCenterOnGpsRef.current) return;
    didCenterOnGpsRef.current = true;
    mapInstanceRef.current.setCenter(new naver.maps.LatLng(userLocation.lat, userLocation.lng));
    mapInstanceRef.current.setZoom(USER_LOCATION_ZOOM);
  }, [userLocation, regionSelected]);

  // NCP 인증 실패(잘못된 ncpKeyId·도메인 미등록)는 SDK 가 throw 하지 않고 회색 빈 지도만 남길 수 있어
  // 폴링(window.naver.maps 존재 확인)으로는 못 잡는다. 네이버 지도 v3 공식 전역 콜백
  // window.navermap_authFailure 를 등록해 인증 실패 시 에러 UI 로 전환.
  // 참고: https://navermaps.github.io/maps.js.ncp/docs/tutorial-1-Getting-Client-ID.html
  useEffect(() => {
    const prev = window.navermap_authFailure;
    window.navermap_authFailure = () => setError(true);
    return () => {
      window.navermap_authFailure = prev;
    };
  }, []);

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

  const heightCls = className ?? "h-96";

  if (error) {
    return (
      <div
        className={`w-full ${heightCls} rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center`}
        role="status"
      >
        <p className="text-sm text-gray-500">지도를 불러오지 못했습니다.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapRef}
        className={`w-full ${heightCls} rounded-lg border border-gray-200`}
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
