/**
 * SearchClusterMap 컴포넌트 테스트 — react-naver-maps 모듈 자체를 mock.
 *
 * MbClusterMap.test.tsx 는 `window.naver` 전역만 흉내 내면 충분했지만(vanilla 폴링 방식),
 * 이 컴포넌트는 react-naver-maps 의 useNavermaps()가 React 19 use() 훅으로 실제 CDN 스크립트
 * 로딩 Promise 를 서스펜드하므로(jsdom 에서 재현 불가) 패키지 자체를 vi.mock 한다.
 * 실행: npx vitest run src/components/search/__tests__/SearchClusterMap.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SearchClusterMap from "../SearchClusterMap";
import type { Complex } from "@/types";

const mockMarkerConstructor = vi.fn(function (this: unknown, opts: unknown) {
  return { _opts: opts };
});
const mockLatLngConstructor = vi.fn(function (lat: number, lng: number) {
  return { lat, lng };
});
const mockLatLngBoundsConstructor = vi.fn(function () {
  return { extend: vi.fn() };
});
const mockAddListener = vi.fn();
const fakeNavermaps = {
  Marker: mockMarkerConstructor,
  LatLng: mockLatLngConstructor,
  LatLngBounds: mockLatLngBoundsConstructor,
  Point: vi.fn(),
  Size: vi.fn(),
  Event: { addListener: mockAddListener, removeListener: vi.fn() },
};

// react-naver-maps 자체를 mock — NavermapsProvider/Container/NaverMap 은 children 을
// 그대로 렌더하는 얇은 컴포넌트로, useMap/useNavermaps 는 고정 mock 값을 반환.
vi.mock("react-naver-maps", () => ({
  NavermapsProvider: ({ children }: { children: React.ReactNode }) => children,
  Container: ({
    children,
  }: {
    children: React.ReactNode | ((navermaps: typeof fakeNavermaps) => React.ReactNode);
  }) => (typeof children === "function" ? children(fakeNavermaps) : children),
  NaverMap: ({ children }: { children: React.ReactNode }) => children,
  useMap: () => ({}),
  useNavermaps: () => fakeNavermaps,
}));

const mockClusteringSetMap = vi.fn();
const mockClusteringConstructor = vi.fn(function () {
  return { setMap: mockClusteringSetMap };
});
vi.mock("@/lib/naver-marker-clustering", () => ({
  makeMarkerClustering: () => mockClusteringConstructor,
}));

function complex(no: string, name: string, latitude?: number, longitude?: number): Complex {
  return { complex_no: no, complex_name: name, latitude, longitude, article_count: 3 };
}

describe("SearchClusterMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "naver", {
      value: { maps: fakeNavermaps },
      writable: true,
      configurable: true,
    });
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "test-client-id");
  });

  it("좌표 있는 단지마다 마커를 생성하고 클러스터링에 전달한다", () => {
    const complexes = [
      complex("1", "래미안1", 37.5, 127.0),
      complex("2", "래미안2", 37.6, 127.1),
    ];
    render(<SearchClusterMap complexes={complexes} />);

    expect(mockMarkerConstructor).toHaveBeenCalledTimes(2);
    expect(mockClusteringConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ markers: expect.any(Array), minClusterSize: 2 }),
    );
  });

  it("좌표 없는 단지(undefined)와 0,0 좌표는 마커 생성에서 제외한다", () => {
    const complexes = [
      complex("1", "좌표없음"),
      complex("2", "제로좌표", 0, 0),
      complex("3", "정상단지", 37.5, 127.0),
    ];
    render(<SearchClusterMap complexes={complexes} />);

    expect(mockMarkerConstructor).toHaveBeenCalledTimes(1);
  });

  it("좌표 있는 단지가 0개면 안내 문구를 표시한다", () => {
    render(<SearchClusterMap complexes={[complex("1", "좌표없음")]} />);
    expect(screen.getByText("표시할 위치 정보가 있는 단지가 없어요.")).toBeInTheDocument();
    expect(mockClusteringConstructor).not.toHaveBeenCalled();
  });

  it("마커 클릭 시 onSelect 콜백에 해당 단지를 전달한다", () => {
    const onSelect = vi.fn();
    const cpx = complex("1", "래미안", 37.5, 127.0);
    render(<SearchClusterMap complexes={[cpx]} onSelect={onSelect} />);

    // Event.addListener(marker, "click", handler) 호출에서 handler 를 꺼내 직접 실행
    const clickCall = mockAddListener.mock.calls.find((c) => c[1] === "click");
    expect(clickCall).toBeDefined();
    clickCall![2]();
    expect(onSelect).toHaveBeenCalledWith(cpx);
  });

  it("네이버 지도 Client ID 미설정 시 에러 안내를 표시한다", () => {
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "");
    render(<SearchClusterMap complexes={[complex("1", "래미안", 37.5, 127.0)]} />);
    expect(screen.getByText("지도를 불러오지 못했습니다.")).toBeInTheDocument();
  });
});
