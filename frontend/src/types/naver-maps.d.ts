/** Naver Maps v3 SDK — 최소 ambient 타입 선언 */

declare namespace naver.maps {
  class Map {
    constructor(el: HTMLElement, opts?: MapOptions);
    fitBounds(bounds: LatLngBounds): void;
    setCenter(latlng: LatLng): void;
    setZoom(level: number): void;
  }
  class Marker {
    constructor(opts?: MarkerOptions);
    setMap(map: Map | null): void;
    getPosition(): LatLng;
  }
  class LatLng {
    constructor(lat: number, lng: number);
  }
  class LatLngBounds {
    constructor();
    extend(latlng: LatLng): void;
  }
  class InfoWindow {
    constructor(opts?: InfoWindowOptions);
    open(map: Map, marker: Marker | LatLng): void;
    close(): void;
    setContent(content: string): void;
    setPosition(latlng: LatLng): void;
  }
  interface MapOptions {
    center?: LatLng;
    zoom?: number;
    zoomControl?: boolean;
    scrollWheel?: boolean;
  }
  interface MarkerOptions {
    position?: LatLng;
    map?: Map;
    title?: string;
  }
  interface InfoWindowOptions {
    content?: string;
    borderWidth?: number;
    disableAnchor?: boolean;
    backgroundColor?: string;
    pixelOffset?: Point;
  }
  class Point {
    constructor(x: number, y: number);
  }
  namespace Event {
    function addListener(
      target: Marker | Map,
      eventName: string,
      handler: () => void,
    ): MapEventListener;
    function removeListener(listener: MapEventListener): void;
  }
  interface MapEventListener {
    eventName: string;
  }
}

interface Window {
  naver?: {
    maps: typeof naver.maps;
  };
  /** 네이버 지도 v3 인증 실패 시 SDK 가 호출하는 전역 콜백 (ncpKeyId·도메인 인증 실패). */
  navermap_authFailure?: () => void;
}
