/** Naver Maps v3 SDK — 최소 ambient 타입 선언 */

declare namespace naver.maps {
  class Map {
    constructor(el: HTMLElement, opts?: MapOptions);
  }
  class Marker {
    constructor(opts?: MarkerOptions);
    setMap(map: Map | null): void;
  }
  class LatLng {
    constructor(lat: number, lng: number);
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
}

interface Window {
  naver?: {
    maps: typeof naver.maps;
  };
}
