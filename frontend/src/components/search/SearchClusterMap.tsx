"use client";

import { useEffect, useRef, useState } from "react";
import {
  NavermapsProvider,
  Container as MapDiv,
  NaverMap,
  useMap,
  useNavermaps,
} from "react-naver-maps";
import type { Complex } from "@/types";
import { makeMarkerClustering } from "@/lib/naver-marker-clustering";

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

interface ClusterLayerProps {
  complexes: (Complex & { latitude: number; longitude: number })[];
  onSelect?: (complex: Complex) => void;
}

/** 실제 마커+클러스터링을 그리는 내부 레이어 — NaverMap 안에서만 렌더(useMap 훅 전제). */
function ClusterLayer({ complexes, onSelect }: ClusterLayerProps) {
  const navermaps = useNavermaps();
  const map = useMap();
  const clusterRef = useRef<InstanceType<ReturnType<typeof makeMarkerClustering>> | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const MarkerClustering = makeMarkerClustering(window.naver);
    const markers = complexes.map((cpx) => {
      const marker = new navermaps.Marker({
        position: new navermaps.LatLng(cpx.latitude, cpx.longitude),
        title: cpx.complex_name,
      });
      navermaps.Event.addListener(marker, "click", () => onSelectRef.current?.(cpx));
      return marker;
    });

    const icons = CLUSTER_COLORS.map((c) => buildClusterIcon(navermaps, c));

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

    return () => {
      clusterRef.current?.setMap(null);
      clusterRef.current = null;
    };
    // complexes 는 부모의 hasCoords 필터 결과 — 필터·정렬 변경 시에만 재생성(전체 재구성 방식,
    // diff 갱신은 1단계 범위 밖 — 계획 문서 §4 참고).
  }, [complexes, navermaps, map]);

  return null;
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
 * react-naver-maps(NavermapsProvider/Container/NaverMap)가 SDK 로딩·Suspense·에러 경계를
 * 대신 관리 — MbClusterMap.tsx의 수동 폴링(window.naver.maps)·navermap_authFailure 콜백
 * 등록이 불필요해짐. 클러스터링 자체는 네이버 공식 MarkerClustering(Apache 2.0)을
 * makeMarkerClustering() 팩토리로 감싸 사용(lib/naver-marker-clustering.ts).
 *
 * 완전 지연 로드 설계(계획 §핵심결정4)의 일부 — 이 파일 자체가 SearchExperience.tsx에서
 * next/dynamic(ssr:false)으로 지연 임포트되므로, 지도 토글을 실제로 클릭하기 전까지는
 * react-naver-maps·지도 SDK 스크립트가 전혀 로드되지 않는다.
 */
export default function SearchClusterMap({ complexes, onSelect, className }: Props) {
  const [scriptError, setScriptError] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const coordItems = complexes.filter(hasCoords);
  const heightCls = className ?? "h-96";

  // NCP 인증 실패(잘못된 clientId·도메인 미등록) 감지 — 네이버 지도 v3 공식 전역 콜백.
  // MbClusterMap.tsx:230-236 패턴 답습(react-naver-maps가 스크립트 로드는 대신하지만
  // 이 전역 콜백 자체는 네이버 SDK가 직접 호출하므로 여전히 우리가 등록해야 함).
  useEffect(() => {
    const prev = window.navermap_authFailure;
    window.navermap_authFailure = () => setScriptError(true);
    return () => {
      window.navermap_authFailure = prev;
    };
  }, []);

  if (!clientId || scriptError) {
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
      <NavermapsProvider ncpClientId={clientId}>
        <MapDiv className={`w-full ${heightCls} rounded-lg border border-gray-200`}>
          {(navermaps) =>
            coordItems.length > 0 ? (
              <NaverMapWithFitBounds coordItems={coordItems} onSelect={onSelect} />
            ) : (
              <NaverMap defaultCenter={new navermaps.LatLng(37.5666, 126.9784)} defaultZoom={12} />
            )
          }
        </MapDiv>
      </NavermapsProvider>
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

interface FitBoundsProps {
  coordItems: (Complex & { latitude: number; longitude: number })[];
  onSelect?: (complex: Complex) => void;
}

/** 좌표 있는 단지 전체가 화면에 들어오도록 fitBounds — 단지 1개면 과확대 방지로 setCenter+고정줌. */
function NaverMapWithFitBounds({ coordItems, onSelect }: FitBoundsProps) {
  const navermaps = useNavermaps();
  const bounds = new navermaps.LatLngBounds();
  coordItems.forEach((c) => bounds.extend(new navermaps.LatLng(c.latitude, c.longitude)));

  return coordItems.length === 1 ? (
    <NaverMap
      defaultCenter={new navermaps.LatLng(coordItems[0].latitude, coordItems[0].longitude)}
      defaultZoom={15}
    >
      <ClusterLayer complexes={coordItems} onSelect={onSelect} />
    </NaverMap>
  ) : (
    <NaverMap defaultBounds={bounds}>
      <ClusterLayer complexes={coordItems} onSelect={onSelect} />
    </NaverMap>
  );
}
