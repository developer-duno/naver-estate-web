"use client";

import { useRef, useEffect, useState } from "react";

const SDK_POLL_INTERVAL = 200;
const SDK_POLL_TIMEOUT = 5000;

interface Props {
  latitude: number;
  longitude: number;
  name?: string;
}

export default function MbLocationMap({ latitude, longitude, name }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<naver.maps.Map | null>(null);
  const markerRef = useRef<naver.maps.Marker | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;

    const init = () => {
      if (cancelled || !mapRef.current || !window.naver?.maps) return;
      try {
        const center = new naver.maps.LatLng(latitude, longitude);
        const map = new naver.maps.Map(mapRef.current, {
          center,
          zoom: 16,
          zoomControl: true,
        });
        const marker = new naver.maps.Marker({
          position: center,
          map,
          title: name,
        });
        mapInstanceRef.current = map;
        markerRef.current = marker;
      } catch {
        setError(true);
      }
    };

    if (window.naver?.maps) {
      init();
    } else {
      // 이벤트 기반 폴링 (하드코딩 타임아웃 대신)
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

    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapInstanceRef.current = null;
    };
  }, [latitude, longitude, name]);

  if (error) {
    return (
      <div
        className="w-full h-80 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center"
        role="status"
      >
        <p className="text-sm text-gray-500">지도를 불러오지 못했습니다.</p>
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className="w-full h-80 rounded-lg border border-gray-200"
      aria-label={`${name ?? "아파트"} 위치 지도`}
    />
  );
}
