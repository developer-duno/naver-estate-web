"use client";

import { useEffect, useRef, useState } from "react";
import Supercluster from "supercluster";
import type { Complex } from "@/types";
import type { GeoCoords } from "@/hooks/useGeolocation";

const SDK_POLL_INTERVAL = 200;
const SDK_POLL_TIMEOUT = 5000;
const NAVER_SCRIPT_ID = "naver-maps-sdk";

/** 네이버 지도 SDK 스크립트를 동적으로 삽입한다 (최초 1회만, 중복 삽입 방지).
 *
 * /mibunyang 하위는 app/mibunyang/layout.tsx 가 <Script strategy="afterInteractive">로
 * 항상 미리 로드해두지만, 검색 페이지(/)는 대부분 트래픽이 지도를 안 쓰는 SEO 진입점이라
 * 완전 지연 로드 원칙(계획 §핵심결정4)을 지키기 위해 이 컴포넌트가 실제로 마운트될 때만
 * (= 사용자가 지도 토글을 눌렀을 때만) 스크립트를 직접 삽입한다. */
function ensureNaverScriptLoaded(clientId: string) {
  if (window.naver?.maps) return;
  if (document.getElementById(NAVER_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = NAVER_SCRIPT_ID;
  script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`;
  script.async = true;
  document.head.appendChild(script);
}

/** 좌표(위·경도)가 둘 다 있는 단지만 지도에 찍을 수 있다.
 * 0,0(좌표 미상을 0으로 채운 데이터)은 아프리카 앞바다라 제외 — 한국 좌표는 위도 33~38, 경도 124~132.
 * (MbClusterMap.tsx:32-41 패턴 답습 — Complex 타입으로 재작성, mb 파일은 안 건드림) */
function hasCoords(cpx: Complex): cpx is Complex & { latitude: number; longitude: number } {
  return (
    typeof cpx.latitude === "number" &&
    typeof cpx.longitude === "number" &&
    cpx.latitude !== 0 &&
    cpx.longitude !== 0
  );
}

/** 클러스터 배지 아이콘 5단계 (개수 구간별) — 네이버 공식 예제 색상 답습, 우리 브랜드 블루로 통일. */
const CLUSTER_COLORS = ["#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"];

/** 클러스터 개수 임계값 — 이 값 이상이면 다음 색 단계로. CLUSTER_COLORS 와 같은 길이. */
const CLUSTER_THRESHOLDS = [10, 50, 100, 300, 1000];

/** 개수에 맞는 색 단계 인덱스. 임계값 미만이면 0단계(가장 옅은 색). */
function colorIndexFor(count: number): number {
  let idx = 0;
  for (let i = 0; i < CLUSTER_THRESHOLDS.length; i++) {
    if (count >= CLUSTER_THRESHOLDS[i]) idx = i;
  }
  return idx;
}

function buildClusterIcon(navermaps: typeof naver.maps, count: number) {
  const color = CLUSTER_COLORS[colorIndexFor(count)];
  return {
    content:
      `<div style="cursor:pointer;width:40px;height:40px;line-height:40px;` +
      `font-size:13px;color:#fff;text-align:center;font-weight:700;` +
      `background:${color};border-radius:50%;border:2px solid #fff;` +
      `box-shadow:0 1px 4px rgba(0,0,0,.35);">${count}</div>`,
    size: new navermaps.Size(40, 40),
    anchor: new navermaps.Point(20, 20),
  };
}

/** supercluster 설정.
 * radius=80px 은 네이버 공식 클러스터링 gridSize(120) 보다 촘촘한 대신 격자가 아니라
 * 실제 거리 기반이라 시각적 밀도가 비슷하다. maxZoom=15 이상에서는 개별 마커만 표시. */
const CLUSTER_RADIUS = 80;
const CLUSTER_MAX_ZOOM = 15;
const CLUSTER_MIN_POINTS = 2;

/** region 미선택 + GPS 허용 시 내 위치 중심 줌 레벨. MbClusterMap.tsx:30 과 동일 값 —
 * 시/군 단위(화면 반경 ~7km) 균형점(세션 318 실측 근거 답습). */
const USER_LOCATION_ZOOM = 12;

/** supercluster 포인트에 실어 나르는 속성 — 마커 클릭 시 원본 단지를 그대로 돌려주기 위함. */
interface PointProps {
  complex: Complex;
}

interface Props {
  complexes: Complex[];
  /** 마커 클릭 콜백 — 부모가 선택 단지 카드 렌더에 사용 */
  onSelect?: (complex: Complex) => void;
  /** 접속자 현재 위치(GPS). 있으면 지도 중심을 내 위치로 (region 미선택 시). MbClusterMap.tsx 패턴 답습. */
  userLocation?: GeoCoords | null;
  /** 지역(시/도) 선택 여부 — true 면 검색 결과 fitBounds(명시 선택 우선, GPS 무시). */
  regionSelected?: boolean;
  /** 지도 컨테이너 높이 클래스. 기본 "h-96". */
  className?: string;
}

/**
 * 매물 검색 결과 다중 마커 클러스터링 지도.
 *
 * MbClusterMap.tsx(미분양 지도) 와 완전히 동일한 vanilla JS + SDK 폴링 패턴 — 세션 348
 * 최초 구현은 react-naver-maps(NavermapsProvider/NaverMap)로 SDK 로딩·React 통합을
 * 대신 맡겼으나, 라이브 실사용 검증에서 `NaverMap` 언마운트 시 호출하는 `instance.destroy()`
 * 가 특정 조건(지도가 완전히 idle 되기 전 재마운트 등)에서 네이버 SDK 내부 참조가 비어
 * `Cannot read properties of null (reading 'isArray')` 로 크래시 → Next.js 전역 에러
 * 경계가 검색 결과 화면 전체를 500 으로 덮어버리는 사고 발견(react-naver-maps 라이브러리
 * 자체의 destroy 경로 문제, patch-package 로 고쳤던 StrictMode 재마운트와는 별개 케이스).
 *
 * MbClusterMap 은 이미 라이브에서 안전이 검증된 패턴 — 지도 인스턴스를 절대 destroy 하지
 * 않고(언마운트 시 ref 만 null 처리), 마커만 setMap(null) 로 지도에서 뗀다.
 *
 * 클러스터링 엔진은 mapbox supercluster. 네이버 공식 MarkerClustering(2016년 구현, 벤더링본)
 * 은 ① 마커 하나하나에 대해 기존 클러스터 전체를 순회하는 O(N×C) 최근접 탐색 ② 지도 idle
 * 마다 전체 마커 DOM 재생성 구조라, 단지 500개 검색 결과에서 지도 탭 INP 3.2초가 라이브로
 * 실측됐다(세션 350). supercluster 는 같은 계산을 KD-tree 로 하고(ms 단위), 화면에 실제로
 * 보이는 클러스터/포인트만 마커로 만들기 때문에 DOM 개수도 보통 10~30개로 유지된다.
 */
/** 단지 집합의 재생성 필요 여부를 판단하는 지문 — id 정렬 join.
 * 정렬만 바뀌면 배열 참조는 달라져도 마커 위치·클릭 대상은 완전히 동일하므로
 * 카메라를 다시 맞추지(fitBounds) 않는다 — 사용자가 그 사이 조작한 지도 위치를 유지하기 위함.
 * (supercluster 인덱스 재구축 자체는 ms 단위라 매번 해도 무방하다.) */
function computeSignature(items: Array<{ complex_no: string }>): string {
  return items.map((c) => c.complex_no).sort().join(",");
}

export default function SearchClusterMap({
  complexes,
  onSelect,
  userLocation,
  regionSelected,
  className,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<naver.maps.Map | null>(null);
  const indexRef = useRef<Supercluster<PointProps> | null>(null);
  /** 현재 화면에 그려둔 마커들 — idle 마다 통째로 교체한다(화면당 보통 10~30개라 저렴). */
  const markersRef = useRef<naver.maps.Marker[]>([]);
  /** 지도 idle 리스너는 지도 인스턴스당 1개만 — 중복 등록 시 idle 마다 렌더가 N배 실행된다. */
  const idleListenerRef = useRef<naver.maps.MapEventListener | null>(null);
  const onSelectRef = useRef(onSelect);
  // 마지막으로 카메라를 맞췄을 때의 단지 집합 지문. 지도 재초기화(언마운트→재마운트) 시
  // 함께 무효화되도록 지도 인스턴스 정리 effect 에서 null 로 되돌린다.
  const signatureRef = useRef<string | null>(null);
  // GPS 좌표 도착 시 카메라를 내 위치로 1회만 옮기기 위한 가드 — MbClusterMap.tsx:89 패턴 답습.
  const didCenterOnGpsRef = useRef(false);
  const [error, setError] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const coordItems = complexes.filter(hasCoords);

  useEffect(() => {
    if (!mapRef.current || !clientId) return;

    ensureNaverScriptLoaded(clientId);

    let cancelled = false;

    /** 화면에서 마커를 모두 떼어낸다. 지도 인스턴스는 건드리지 않는다. */
    const clearMarkers = () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };

    /** 현재 카메라(bbox + zoom)에 해당하는 클러스터/개별 마커만 새로 그린다.
     * supercluster 조회는 KD-tree 라 ms 단위, 마커 수도 화면에 보이는 것뿐이라
     * idle 마다 전량 재생성해도 벤더 라이브러리 대비 훨씬 싸다. */
    const renderVisible = (map: naver.maps.Map) => {
      const index = indexRef.current;
      if (!index) return;
      const bounds = map.getBounds();
      const sw = bounds.getSW();
      const ne = bounds.getNE();
      const bbox: [number, number, number, number] = [sw.lng(), sw.lat(), ne.lng(), ne.lat()];
      // 네이버 v3 줌은 웹메르카토르 타일 줌과 같은 축이라 그대로 전달한다.
      // supercluster 는 정수 줌 단위로 인덱싱하므로 반올림.
      const zoom = Math.round(map.getZoom());

      clearMarkers();

      for (const feature of index.getClusters(bbox, zoom)) {
        const [lng, lat] = feature.geometry.coordinates;
        const position = new naver.maps.LatLng(lat, lng);
        const props = feature.properties;

        if ("cluster" in props && props.cluster) {
          const count = props.point_count;
          const clusterId = props.cluster_id;
          const marker = new naver.maps.Marker({
            position,
            icon: buildClusterIcon(naver.maps, count),
          });
          naver.maps.Event.addListener(marker, "click", () => {
            // 클러스터를 누르면 그 클러스터가 쪼개지는 줌까지 확대 — supercluster 가
            // 정확한 줌을 계산해준다(벤더 라이브러리의 "현재 줌 +1" 추정보다 정확).
            const expansionZoom = index.getClusterExpansionZoom(clusterId);
            map.setCenter(position);
            map.setZoom(expansionZoom);
          });
          marker.setMap(map);
          markersRef.current.push(marker);
        } else {
          const { complex: cpx } = props as PointProps;
          const marker = new naver.maps.Marker({ position, title: cpx.complex_name });
          naver.maps.Event.addListener(marker, "click", () => onSelectRef.current?.(cpx));
          marker.setMap(map);
          markersRef.current.push(marker);
        }
      }
    };

    const init = () => {
      if (cancelled || !mapRef.current || !window.naver?.maps) return;
      try {
        const fallbackCenter = new naver.maps.LatLng(37.5666, 126.9784);
        const map =
          mapInstanceRef.current ??
          new naver.maps.Map(mapRef.current, {
            center: fallbackCenter,
            zoom: 12,
            zoomControl: true,
          });
        mapInstanceRef.current = map;

        // 지도 이동/줌이 끝날 때마다 화면에 보이는 것만 다시 그린다. 지도 인스턴스당 1회만 등록.
        if (!idleListenerRef.current) {
          idleListenerRef.current = naver.maps.Event.addListener(map, "idle", () =>
            renderVisible(map),
          );
        }

        if (coordItems.length === 0) {
          indexRef.current = null;
          signatureRef.current = null;
          clearMarkers();
          return;
        }

        // supercluster 인덱스는 매번 새로 만든다 — 500개 기준 ms 단위라 skip 할 이유가 없고,
        // 오히려 항상 최신 데이터를 보장한다(같은 id 집합이어도 가격 등 속성이 바뀔 수 있음).
        const index = new Supercluster<PointProps>({
          radius: CLUSTER_RADIUS,
          maxZoom: CLUSTER_MAX_ZOOM,
          minPoints: CLUSTER_MIN_POINTS,
        });
        index.load(
          coordItems.map((cpx) => ({
            type: "Feature" as const,
            properties: { complex: cpx },
            geometry: { type: "Point" as const, coordinates: [cpx.longitude, cpx.latitude] },
          })),
        );
        indexRef.current = index;

        // 정렬만 바뀌어 마커 집합(id 기준)이 직전과 동일하면 카메라를 다시 맞추지 않는다 —
        // 사용자가 그 사이 지도를 옮겨봤다면 그 위치를 그대로 유지해야 하기 때문.
        // 마커 자체는 아래 renderVisible() 로 새 인덱스 기준 다시 그린다.
        const signature = computeSignature(coordItems);
        const sameSet = signatureRef.current === signature;
        signatureRef.current = signature;

        if (!sameSet) {
          // 지도 중심·줌 우선순위: ① region 선택 → 검색 결과 fitBounds/setCenter(명시 선택 우선)
          // ② region 미선택 + GPS 허용 → 내 위치 중심 + 적정 줌 ③ 그 외 → 검색 결과 폴백.
          // MbClusterMap.tsx:169-181 과 동일 우선순위.
          if (!regionSelected && userLocation) {
            map.setCenter(new naver.maps.LatLng(userLocation.lat, userLocation.lng));
            map.setZoom(USER_LOCATION_ZOOM);
            didCenterOnGpsRef.current = true;
          } else if (coordItems.length === 1) {
            // 단지 1개면 fitBounds 가 과도하게 확대 → setCenter+적정 줌으로.
            map.setCenter(new naver.maps.LatLng(coordItems[0].latitude, coordItems[0].longitude));
            map.setZoom(15);
          } else {
            const bounds = new naver.maps.LatLngBounds();
            coordItems.forEach((cpx) =>
              bounds.extend(new naver.maps.LatLng(cpx.latitude, cpx.longitude)),
            );
            map.fitBounds(bounds);
          }
        }

        // 카메라 설정 직후 명시적으로 1회 그린다. 벤더 라이브러리 시절에는 클러스터 배치가
        // 지도 "idle" 이벤트에만 반응해, fitBounds 후 idle 이 안 오면 마커가 처음 좌표에
        // 뭉친 채 남는 결함이 있었다(세션 349, trigger(map,"idle") 로 우회). 이제는 렌더를
        // 직접 호출하므로 idle 발화 여부에 의존하지 않는다 — 그 우회 자체가 불필요해졌다.
        renderVisible(map);
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
      };
    }

    // 마커·지도 정리는 여기서 하지 않는다 — React 는 effect 재실행마다 "이전 cleanup →
    // 새 effect" 순서를 지키므로, 여기서 마커를 지우면 매 렌더마다 깜빡임이 생긴다.
    // 실제 정리는 effect 본문(빈 데이터 전환)과 완전 언마운트 effect(아래, deps: [])가 담당.
    return () => {
      cancelled = true;
    };
    // complexes 는 부모의 hasCoords 필터 결과 — effect 자체는 필터·정렬 변경마다 실행되나,
    // 위 signature 비교로 id 집합이 실제로 안 바뀌었으면(정렬만 변경) 카메라 재조정을 skip 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexes, clientId]);

  // GPS 좌표는 비동기로 늦게 도착 → 마커 재생성 없이 카메라만 내 위치로 이동.
  // region 선택 시엔 무시(명시 선택 우선). 좌표 도착 시 단 1회만 setCenter —
  // 이미 센터링했거나(didCenterOnGpsRef) 사용자가 그 사이 지도를 조작했어도 강제로 끌어오지
  // 않음. MbClusterMap.tsx:215-224 와 동일 패턴.
  useEffect(() => {
    if (regionSelected || !userLocation || !mapInstanceRef.current) return;
    if (didCenterOnGpsRef.current) return;
    didCenterOnGpsRef.current = true;
    mapInstanceRef.current.setCenter(new naver.maps.LatLng(userLocation.lat, userLocation.lng));
    mapInstanceRef.current.setZoom(USER_LOCATION_ZOOM);
  }, [userLocation, regionSelected]);

  // NCP 인증 실패(잘못된 clientId·도메인 미등록) 감지 — 네이버 지도 v3 공식 전역 콜백.
  // MbClusterMap.tsx:230-236 과 동일 패턴.
  useEffect(() => {
    const prev = window.navermap_authFailure;
    window.navermap_authFailure = () => setError(true);
    return () => {
      window.navermap_authFailure = prev;
    };
  }, []);

  // 언마운트 시 지도 인스턴스 정리 — MbClusterMap.tsx:239-247 과 동일하게 destroy() 는
  // 호출하지 않는다(react-naver-maps 의 instance.destroy() 크래시 재발 방지가 이 재작성의
  // 핵심 목적). ref 만 비워 다음 마운트가 새 지도를 만들도록 한다.
  useEffect(() => {
    return () => {
      if (idleListenerRef.current) {
        naver.maps.Event.removeListener(idleListenerRef.current);
        idleListenerRef.current = null;
      }
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      indexRef.current = null;
      signatureRef.current = null;
      mapInstanceRef.current = null;
    };
  }, []);

  const heightCls = className ?? "h-96";

  if (!clientId || error) {
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
