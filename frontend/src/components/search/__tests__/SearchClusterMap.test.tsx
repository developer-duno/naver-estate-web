/**
 * SearchClusterMap 컴포넌트 테스트 — naver.maps mock (vanilla 폴링 방식).
 *
 * MbClusterMap.test.tsx 의 installNaverMock 패턴 답습. react-naver-maps 의존을 제거하고
 * (라이브 실사용 검증에서 발견된 instance.destroy() 크래시 재발 방지) MbClusterMap 과 동일한
 * vanilla JS + window.naver 폴링 방식으로 재작성됨에 따라 테스트도 동일 패턴으로 전환.
 * 실행: npx vitest run src/components/search/__tests__/SearchClusterMap.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SearchClusterMap from "../SearchClusterMap";
import type { Complex } from "@/types";

// ⚠️ naver SDK 의 Map/Marker/LatLng 등은 클래스(생성자)다. 컴포넌트가 `new naver.maps.X()`
// 로 호출하므로 mock 도 `new` 가능해야 한다 — 화살표 함수는 생성자로 못 써서 TypeError.
const mockMapInstance = { fitBounds: vi.fn(), setCenter: vi.fn(), setZoom: vi.fn() };
const mockMapConstructor = vi.fn(function () {
  return mockMapInstance;
});
const mockMarkerConstructor = vi.fn(function (opts: unknown) {
  return { setMap: vi.fn(), _opts: opts };
});
const mockLatLngConstructor = vi.fn(function (lat: number, lng: number) {
  return { lat, lng };
});
const mockBoundsExtend = vi.fn();
const mockLatLngBoundsConstructor = vi.fn(function () {
  return { extend: mockBoundsExtend };
});
const eventHandlers: Array<[unknown, string, () => void]> = [];
const mockAddListener = vi.fn().mockImplementation((target: unknown, event: string, handler: () => void) => {
  eventHandlers.push([target, event, handler]);
  return { eventName: event };
});

function installNaverMock() {
  Object.defineProperty(window, "naver", {
    value: {
      maps: {
        Map: mockMapConstructor,
        Marker: mockMarkerConstructor,
        LatLng: mockLatLngConstructor,
        LatLngBounds: mockLatLngBoundsConstructor,
        Point: vi.fn(),
        Size: vi.fn(),
        Event: { addListener: mockAddListener, removeListener: vi.fn(), trigger: vi.fn() },
      },
    },
    writable: true,
    configurable: true,
  });
}

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
    eventHandlers.length = 0;
    installNaverMock();
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
    expect(mockMapInstance.fitBounds).toHaveBeenCalled();
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

  it("좌표 있는 단지가 0개면 안내 문구를 표시하고 클러스터링을 생성하지 않는다", () => {
    render(<SearchClusterMap complexes={[complex("1", "좌표없음")]} />);
    expect(screen.getByText("표시할 위치 정보가 있는 단지가 없어요.")).toBeInTheDocument();
    expect(mockClusteringConstructor).not.toHaveBeenCalled();
    // 지도 자체는 fallback 중심으로 여전히 생성됨 (MbClusterMap 패턴 답습)
    expect(mockMapConstructor).toHaveBeenCalled();
  });

  it("마커 클릭 시 onSelect 콜백에 해당 단지를 전달한다", () => {
    const onSelect = vi.fn();
    const cpx = complex("1", "래미안", 37.5, 127.0);
    render(<SearchClusterMap complexes={[cpx]} onSelect={onSelect} />);

    const clickCall = eventHandlers.find((c) => c[1] === "click");
    expect(clickCall).toBeDefined();
    clickCall![2]();
    expect(onSelect).toHaveBeenCalledWith(cpx);
  });

  it("단지 1개면 fitBounds 대신 setCenter+setZoom(15)을 쓴다", () => {
    render(<SearchClusterMap complexes={[complex("1", "래미안", 37.5, 127.0)]} />);
    expect(mockMapInstance.setCenter).toHaveBeenCalled();
    expect(mockMapInstance.setZoom).toHaveBeenCalledWith(15);
    expect(mockMapInstance.fitBounds).not.toHaveBeenCalled();
  });

  it("네이버 지도 Client ID 미설정 시 에러 안내를 표시한다", () => {
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "");
    render(<SearchClusterMap complexes={[complex("1", "래미안", 37.5, 127.0)]} />);
    expect(screen.getByText("지도를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(mockMapConstructor).not.toHaveBeenCalled();
  });
});
