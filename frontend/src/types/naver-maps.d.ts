/** Naver Maps v3 SDK — 최소 ambient 타입 선언 */

declare namespace naver.maps {
  class Map {
    constructor(el: HTMLElement, opts?: MapOptions);
    fitBounds(bounds: LatLngBounds): void;
    setCenter(latlng: LatLng): void;
    setZoom(level: number): void;
    /** 현재 화면에 보이는 영역. supercluster 에 넘길 bbox 계산용. */
    getBounds(): LatLngBounds;
    /** 현재 줌 레벨. 네이버 v3 줌은 웹메르카토르 타일 줌과 같은 축이라 supercluster 에 그대로 전달 가능. */
    getZoom(): number;
  }
  class Marker {
    constructor(opts?: MarkerOptions);
    setMap(map: Map | null): void;
    getPosition(): LatLng;
    setIcon(icon: HtmlIcon): void;
  }
  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }
  class LatLngBounds {
    constructor();
    extend(latlng: LatLng): void;
    /** 남서쪽(최소 위·경도) 꼭짓점. getBounds() 결과에서 bbox 를 뽑을 때 사용. */
    getSW(): LatLng;
    /** 북동쪽(최대 위·경도) 꼭짓점. */
    getNE(): LatLng;
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
    /** HTML 마커 아이콘 — content(HTML 문자열) + anchor(기준점). 공식 v3 HtmlIcon. */
    icon?: HtmlIcon;
  }
  interface HtmlIcon {
    content: string;
    anchor?: Point;
    size?: Size;
  }
  class Size {
    constructor(width: number, height: number);
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
    function trigger(target: Map, eventName: string): void;
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
