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

// 실제 ResizeObserver 콜백을 수동으로 발동시킬 수 있는 mock — 전역 test-setup.ts 의 no-op
// 폴리필(Radix 용)과 달리, 이 컴포넌트의 "컨테이너 실제 크기 확정 후 재생성" 로직을 검증하려면
// observe() 시점의 콜백을 붙잡아뒀다가 테스트에서 직접 호출할 수 있어야 한다.
let capturedResizeCallback: ((entries: Array<{ contentRect: { width: number } }>) => void) | null = null;
const mockResizeObserverDisconnect = vi.fn();
class MockResizeObserver {
  constructor(cb: (entries: Array<{ contentRect: { width: number } }>) => void) {
    capturedResizeCallback = cb;
  }
  observe() {}
  disconnect = mockResizeObserverDisconnect;
}

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
    capturedResizeCallback = null;
    installNaverMock();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
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

  it("ResizeObserver 가 컨테이너 크기 확정을 감지하면 지도·마커를 재생성한다 (뭉침 결함 회귀 가드)", () => {
    // 라이브 실측: next/dynamic 지연 마운트 직후엔 컨테이너가 좁은 크기라 마커가 한 점에
    // 뭉쳐 그려진다. resize 이벤트 트리거만으론 안 고쳐지고, 컨테이너가 실제 최종 크기에
    // 도달한 뒤 지도·마커를 통째로 재생성해야 정상 위치로 그려짐을 확인(세션 349).
    const complexes = [
      complex("1", "래미안1", 37.5, 127.0),
      complex("2", "래미안2", 37.6, 127.1),
    ];
    render(<SearchClusterMap complexes={complexes} />);

    const initialMapCalls = mockMapConstructor.mock.calls.length;
    const initialMarkerCalls = mockMarkerConstructor.mock.calls.length;
    expect(initialMapCalls).toBe(1);
    expect(initialMarkerCalls).toBe(2);

    // ResizeObserver 콜백이 잡혔는지 확인 후, 컨테이너가 최종 크기(0이 아닌 width)에
    // 도달했다는 신호를 흉내내 수동으로 발동.
    expect(capturedResizeCallback).not.toBeNull();
    capturedResizeCallback!([{ contentRect: { width: 1224 } }]);

    // 재생성 = 지도·마커 생성자가 한 번 더 불려야 한다 (총 2회).
    expect(mockMapConstructor.mock.calls.length).toBe(initialMapCalls + 1);
    expect(mockMarkerConstructor.mock.calls.length).toBe(initialMarkerCalls + 2);
    expect(mockResizeObserverDisconnect).toHaveBeenCalled();

    // width:0 은 아직 레이아웃 미확정 상태라 재생성 스킵(가드) — 재발동해도 더 늘지 않는다.
    capturedResizeCallback!([{ contentRect: { width: 0 } }]);
    expect(mockMapConstructor.mock.calls.length).toBe(initialMapCalls + 1);

    // 한 번 재생성한 뒤엔 disconnect 됐으니 다시 유효한 크기를 줘도 더 이상 재생성 안 함(1회 한정).
    capturedResizeCallback!([{ contentRect: { width: 1300 } }]);
    expect(mockMapConstructor.mock.calls.length).toBe(initialMapCalls + 1);
  });

  it("네이버 지도 Client ID 미설정 시 에러 안내를 표시한다", () => {
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "");
    render(<SearchClusterMap complexes={[complex("1", "래미안", 37.5, 127.0)]} />);
    expect(screen.getByText("지도를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(mockMapConstructor).not.toHaveBeenCalled();
  });
});
