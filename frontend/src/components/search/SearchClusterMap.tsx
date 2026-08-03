"use client";

import { useEffect, useRef, useState } from "react";
import type { Complex } from "@/types";
import { makeMarkerClustering } from "@/lib/naver-marker-clustering";

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

function buildClusterIcon(navermaps: typeof naver.maps, color: string) {
  return {
    content:
      `<div style="cursor:pointer;width:40px;height:40px;line-height:40px;` +
      `font-size:13px;color:#fff;text-align:center;font-weight:700;` +
      `background:${color};border-radius:50%;border:2px solid #fff;` +
      `box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>`,
    size: new navermaps.Size(40, 40),
    anchor: new navermaps.Point(20, 20),
  };
}

interface Props {
  complexes: Complex[];
  /** 마커 클릭 콜백 — 부모가 선택 단지 카드 렌더에 사용 */
  onSelect?: (complex: Complex) => void;
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
 * 않고(언마운트 시 ref 만 null 처리), 마커만 setMap(null) 로 지도에서 뗀다. 그래서 react-naver-maps
 * 의존을 버리고 이 패턴으로 재작성했다. 클러스터링 자체(네이버 공식 MarkerClustering)는 그대로
 * lib/naver-marker-clustering.ts 를 재사용.
 */
export default function SearchClusterMap({ complexes, onSelect, className }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<naver.maps.Map | null>(null);
  const clusterRef = useRef<InstanceType<ReturnType<typeof makeMarkerClustering>> | null>(null);
  const onSelectRef = useRef(onSelect);
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

    const clearCluster = () => {
      clusterRef.current?.setMap(null);
      clusterRef.current = null;
    };

    const init = () => {
      if (cancelled || !mapRef.current || !window.naver?.maps) return;
      try {
        clearCluster();

        const fallbackCenter = new naver.maps.LatLng(37.5666, 126.9784);
        const map =
          mapInstanceRef.current ??
          new naver.maps.Map(mapRef.current, {
            center: fallbackCenter,
            zoom: 12,
            zoomControl: true,
          });
        mapInstanceRef.current = map;

        if (coordItems.length === 0) return;

        const MarkerClustering = makeMarkerClustering(window.naver);
        const bounds = new naver.maps.LatLngBounds();
        const markers = coordItems.map((cpx) => {
          const pos = new naver.maps.LatLng(cpx.latitude, cpx.longitude);
          bounds.extend(pos);
          const marker = new naver.maps.Marker({ position: pos, title: cpx.complex_name });
          naver.maps.Event.addListener(marker, "click", () => onSelectRef.current?.(cpx));
          return marker;
        });

        const icons = CLUSTER_COLORS.map((c) => buildClusterIcon(naver.maps, c));
        clusterRef.current = new MarkerClustering({
          minClusterSize: 2,
          maxZoom: 15,
          map,
          markers,
          disableClickZoom: false,
          gridSize: 120,
          icons,
          indexGenerator: [10, 50, 100, 300, 1000],
          stylingFunction: (clusterMarker: naver.maps.Marker, count: number) => {
            const el = clusterMarker.getElement?.();
            const div = el?.querySelector("div");
            if (div) div.textContent = String(count);
          },
        });

        if (coordItems.length === 1) {
          // 단지 1개면 fitBounds 가 과도하게 확대 → setCenter+적정 줌으로.
          map.setCenter(new naver.maps.LatLng(coordItems[0].latitude, coordItems[0].longitude));
          map.setZoom(15);
        } else {
          map.fitBounds(bounds);
        }

        // 근본 원인(라이브 실측으로 확정): 마커 클러스터링 라이브러리(naver-marker-clustering.ts
        // onAdd())는 지도의 "idle" 이벤트에만 반응해 클러스터 배치를 다시 계산한다(_onIdle→
        // _redraw). 최초 MarkerClustering 생성 시 markers.length>0 이면 그 순간의(아직
        // fitBounds 적용 전) 좁은 카메라 기준으로 즉시 1회 그리는데, 그 뒤 fitBounds 로
        // 카메라를 옮겨도 지도 자체의 투영(getProjection)은 정상 갱신되지만 idle 이벤트가
        // 아직 발생하지 않았거나 클러스터 쪽에서 놓쳐 마커가 처음 좌표에 고정된 채로 남는다
        // (실측: naver.maps.Event.trigger(map,"resize")·fitBounds 재호출·지도 재생성 전부
        // 무효, trigger(map,"idle") 단 한 줄로 즉시 정상 분산 확인). resize·재생성 시도는
        // 전부 폐기하고 idle 트리거로 교체.
        naver.maps.Event.trigger(map, "idle");
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
        clearCluster();
      };
    }

    return () => {
      cancelled = true;
      clearCluster();
    };
    // complexes 는 부모의 hasCoords 필터 결과 — 필터·정렬 변경 시에만 재생성(전체 재구성 방식,
    // diff 갱신은 1단계 범위 밖 — 계획 문서 §4 참고).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexes, clientId]);

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
      clusterRef.current?.setMap(null);
      clusterRef.current = null;
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
