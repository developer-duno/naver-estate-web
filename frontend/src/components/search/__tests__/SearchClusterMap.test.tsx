/**
 * SearchClusterMap 컴포넌트 테스트 — naver.maps mock (vanilla 폴링 방식) + supercluster 실물.
 *
 * MbClusterMap.test.tsx 의 installNaverMock 패턴 답습. react-naver-maps 의존을 제거하고
 * (라이브 실사용 검증에서 발견된 instance.destroy() 크래시 재발 방지) MbClusterMap 과 동일한
 * vanilla JS + window.naver 폴링 방식으로 재작성됨에 따라 테스트도 동일 패턴으로 전환.
 *
 * 클러스터링 엔진(supercluster)은 mock 하지 않는다 — 순수 JS 라이브러리라 jsdom 에서 그대로
 * 돌고, 실제 클러스터링 결과(몇 개가 클러스터로 묶였는지)를 직접 단언할 수 있기 때문.
 * 지도 mock 은 전 세계를 덮는 bounds + 낮은 줌을 반환해, 근접 좌표가 실제로 클러스터로
 * 묶이는 상황을 재현한다.
 *
 * 실행: npx vitest run src/components/search/__tests__/SearchClusterMap.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SearchClusterMap from "../SearchClusterMap";
import type { Complex } from "@/types";

// ⚠️ naver SDK 의 Map/Marker/LatLng 등은 클래스(생성자)다. 컴포넌트가 `new naver.maps.X()`
// 로 호출하므로 mock 도 `new` 가능해야 한다 — 화살표 함수는 생성자로 못 써서 TypeError.

/** 지도 mock 이 돌려줄 현재 줌. 테스트별로 바꿔 클러스터/개별 마커 분기를 검증한다. */
let currentZoom = 6;

const mockMapInstance = {
  fitBounds: vi.fn(),
  setCenter: vi.fn(),
  setZoom: vi.fn(),
  // 전 세계를 덮는 bounds — supercluster 가 모든 포인트를 후보로 보게 한다.
  getBounds: vi.fn(() => ({
    getSW: () => ({ lat: () => -85, lng: () => -180 }),
    getNE: () => ({ lat: () => 85, lng: () => 180 }),
  })),
  getZoom: vi.fn(() => currentZoom),
};
const mockMapConstructor = vi.fn(function () {
  return mockMapInstance;
});

/** 생성된 마커들 — 클러스터 배지(HTML icon) 인지 개별 마커(title) 인지 구분해 단언한다. */
interface MockMarkerOpts {
  position?: unknown;
  title?: string;
  icon?: { content: string };
}
const createdMarkers: Array<{ opts: MockMarkerOpts; setMap: ReturnType<typeof vi.fn> }> = [];
const mockMarkerConstructor = vi.fn(function (opts: MockMarkerOpts) {
  const marker = { opts, setMap: vi.fn() };
  createdMarkers.push(marker);
  return marker;
});

const mockLatLngConstructor = vi.fn(function (lat: number, lng: number) {
  return { lat: () => lat, lng: () => lng, _lat: lat, _lng: lng };
});
const mockBoundsExtend = vi.fn();
const mockLatLngBoundsConstructor = vi.fn(function () {
  return { extend: mockBoundsExtend };
});

const eventHandlers: Array<[unknown, string, () => void]> = [];
const mockAddListener = vi
  .fn()
  .mockImplementation((target: unknown, event: string, handler: () => void) => {
    eventHandlers.push([target, event, handler]);
    return { eventName: event };
  });
const mockRemoveListener = vi.fn();

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
        Event: {
          addListener: mockAddListener,
          removeListener: mockRemoveListener,
          trigger: vi.fn(),
        },
      },
    },
    writable: true,
    configurable: true,
  });
}

function complex(no: string, name: string, latitude?: number, longitude?: number): Complex {
  return { complex_no: no, complex_name: name, latitude, longitude, article_count: 3 };
}

/** 개별 단지 마커 = title 이 있는 마커. 클러스터 배지 마커는 icon(HTML) 만 갖는다. */
const pointMarkers = () => createdMarkers.filter((m) => m.opts.title !== undefined);
const clusterMarkers = () => createdMarkers.filter((m) => m.opts.icon !== undefined);

describe("SearchClusterMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.length = 0;
    createdMarkers.length = 0;
    currentZoom = 6;
    installNaverMock();
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "test-client-id");
  });

  it("멀리 떨어진 단지는 줌이 충분하면 각각 개별 마커로 그린다", () => {
    // 서울·부산처럼 멀리 떨어진 두 단지는 클러스터 반경(80px) 밖이라 개별 마커 2개.
    currentZoom = 12;
    render(
      <SearchClusterMap
        complexes={[complex("1", "래미안1", 37.5, 127.0), complex("2", "래미안2", 35.1, 129.0)]}
      />,
    );

    expect(pointMarkers()).toHaveLength(2);
    expect(clusterMarkers()).toHaveLength(0);
    // 마커는 지도에 실제로 붙어야 한다.
    expect(pointMarkers()[0].setMap).toHaveBeenCalledWith(mockMapInstance);
  });

  it("가까운 단지들은 낮은 줌에서 클러스터 배지 하나로 묶인다", () => {
    // 줌 6(전국 단위)에서 서울 안 세 단지는 반경 80px 안에 들어와 클러스터 1개로.
    currentZoom = 6;
    render(
      <SearchClusterMap
        complexes={[
          complex("1", "래미안1", 37.5, 127.0),
          complex("2", "래미안2", 37.51, 127.01),
          complex("3", "래미안3", 37.52, 127.02),
        ]}
      />,
    );

    expect(clusterMarkers()).toHaveLength(1);
    expect(pointMarkers()).toHaveLength(0);
    // 배지에는 묶인 개수가 찍힌다.
    expect(clusterMarkers()[0].opts.icon!.content).toContain(">3<");
  });

  it("좌표 없는 단지(undefined)와 0,0 좌표는 마커 생성에서 제외한다", () => {
    currentZoom = 12;
    render(
      <SearchClusterMap
        complexes={[
          complex("1", "좌표없음"),
          complex("2", "제로좌표", 0, 0),
          complex("3", "정상단지", 37.5, 127.0),
        ]}
      />,
    );

    expect(pointMarkers()).toHaveLength(1);
    expect(pointMarkers()[0].opts.title).toBe("정상단지");
  });

  it("좌표 있는 단지가 0개면 안내 문구를 표시하고 마커를 만들지 않는다", () => {
    render(<SearchClusterMap complexes={[complex("1", "좌표없음")]} />);

    expect(screen.getByText("표시할 위치 정보가 있는 단지가 없어요.")).toBeInTheDocument();
    expect(createdMarkers).toHaveLength(0);
    // 지도 자체는 fallback 중심으로 여전히 생성됨 (MbClusterMap 패턴 답습)
    expect(mockMapConstructor).toHaveBeenCalled();
  });

  it("개별 마커 클릭 시 onSelect 콜백에 해당 단지를 전달한다", () => {
    currentZoom = 12;
    const onSelect = vi.fn();
    const cpx = complex("1", "래미안", 37.5, 127.0);
    render(<SearchClusterMap complexes={[cpx]} onSelect={onSelect} />);

    const marker = pointMarkers()[0];
    const clickCall = eventHandlers.find((c) => c[0] === marker && c[1] === "click");
    expect(clickCall).toBeDefined();
    clickCall![2]();
    expect(onSelect).toHaveBeenCalledWith(cpx);
  });

  it("클러스터 마커 클릭 시 확대 줌으로 이동한다 (개별 선택 콜백은 호출 안 함)", () => {
    currentZoom = 6;
    const onSelect = vi.fn();
    render(
      <SearchClusterMap
        complexes={[
          complex("1", "래미안1", 37.5, 127.0),
          complex("2", "래미안2", 37.51, 127.01),
        ]}
        onSelect={onSelect}
      />,
    );

    const cluster = clusterMarkers()[0];
    const clickCall = eventHandlers.find((c) => c[0] === cluster && c[1] === "click");
    expect(clickCall).toBeDefined();

    vi.clearAllMocks();
    clickCall![2]();
    // 클러스터가 쪼개지는 줌으로 확대 — 현재 줌(6)보다 커야 한다.
    expect(mockMapInstance.setZoom).toHaveBeenCalled();
    const zoomArg = mockMapInstance.setZoom.mock.calls[0][0] as number;
    expect(zoomArg).toBeGreaterThan(6);
    expect(mockMapInstance.setCenter).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("지도 idle 이벤트가 오면 현재 화면 기준으로 마커를 다시 그린다", () => {
    // 벤더 라이브러리를 대체한 핵심 구조: 지도가 움직이면(idle) 화면에 보이는 것만 다시 그린다.
    currentZoom = 6;
    render(
      <SearchClusterMap
        complexes={[
          complex("1", "래미안1", 37.5, 127.0),
          complex("2", "래미안2", 37.51, 127.01),
        ]}
      />,
    );
    expect(clusterMarkers()).toHaveLength(1);

    const idleHandler = eventHandlers.find((c) => c[0] === mockMapInstance && c[1] === "idle");
    expect(idleHandler).toBeDefined();

    // 사용자가 확대한 상황 — idle 이 오면 클러스터가 개별 마커 2개로 풀려야 한다.
    createdMarkers.length = 0;
    currentZoom = 15;
    idleHandler![2]();
    expect(pointMarkers()).toHaveLength(2);
    expect(clusterMarkers()).toHaveLength(0);
  });

  it("idle 리스너는 지도당 1개만 등록한다 (중복 등록 시 렌더가 배로 늘어남)", () => {
    currentZoom = 12;
    const a = complex("1", "래미안1", 37.5, 127.0);
    const b = complex("2", "래미안2", 35.1, 129.0);
    const { rerender } = render(<SearchClusterMap complexes={[a, b]} />);
    rerender(<SearchClusterMap complexes={[a, b, complex("3", "래미안3", 36.3, 127.4)]} />);

    const idleListeners = eventHandlers.filter((c) => c[0] === mockMapInstance && c[1] === "idle");
    expect(idleListeners).toHaveLength(1);
  });

  it("단지 1개면 fitBounds 대신 setCenter+setZoom(15)을 쓴다", () => {
    render(<SearchClusterMap complexes={[complex("1", "래미안", 37.5, 127.0)]} />);
    expect(mockMapInstance.setCenter).toHaveBeenCalled();
    expect(mockMapInstance.setZoom).toHaveBeenCalledWith(15);
    expect(mockMapInstance.fitBounds).not.toHaveBeenCalled();
  });

  it("정렬만 바뀌어 id 집합이 동일하면 카메라를 다시 맞추지 않는다 (사용자 조작 위치 유지)", () => {
    // 근본 배경(라이브 실측, 세션 350): 강남구 500개 마커 검색 결과에서 지도 탭 클릭 INP 가
    // 3,212ms 로 실측됨. 엔진은 supercluster 로 교체돼 재계산 자체는 ms 단위가 됐지만,
    // 정렬만 바뀌었을 때 fitBounds 를 다시 부르면 사용자가 옮겨둔 지도 위치가 튕겨 돌아간다.
    currentZoom = 12;
    const a = complex("1", "래미안1", 37.5, 127.0);
    const b = complex("2", "래미안2", 35.1, 129.0);
    const { rerender } = render(<SearchClusterMap complexes={[a, b]} />);
    expect(mockMapInstance.fitBounds).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    // 정렬 순서만 바뀐 새 배열 (id 집합 동일)
    rerender(<SearchClusterMap complexes={[b, a]} />);
    expect(mockMapInstance.fitBounds).not.toHaveBeenCalled();
    expect(mockMapInstance.setCenter).not.toHaveBeenCalled();
  });

  it("필터로 단지 집합(id) 이 실제로 바뀌면 카메라를 다시 맞춘다", () => {
    currentZoom = 12;
    const a = complex("1", "래미안1", 37.5, 127.0);
    const b = complex("2", "래미안2", 35.1, 129.0);
    const c = complex("3", "래미안3", 36.3, 127.4);
    const { rerender } = render(<SearchClusterMap complexes={[a, b]} />);
    expect(mockMapInstance.fitBounds).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    createdMarkers.length = 0;
    // id 집합이 실제로 바뀜(2 → 3 추가) — 카메라 재조정 + 마커 3개
    rerender(<SearchClusterMap complexes={[a, b, c]} />);
    expect(mockMapInstance.fitBounds).toHaveBeenCalledTimes(1);
    expect(pointMarkers()).toHaveLength(3);
  });

  // ── 위치 기준 줌 우선순위: region 선택 > GPS > 검색 결과 fitBounds ──
  // MbClusterMap.test.tsx:206-231 패턴 답습(GPS 이식, mibunyang 지도 성능 이식 재검토 세션).

  it("userLocation 있고 regionSelected 아니면 내 위치로 setCenter+setZoom(12)", () => {
    render(
      <SearchClusterMap
        complexes={[complex("1", "래미안1", 37.5, 127.0), complex("2", "래미안2", 37.6, 127.1)]}
        userLocation={{ lat: 35.1, lng: 129.0 }}
      />,
    );
    expect(mockMapInstance.setCenter).toHaveBeenCalled();
    expect(mockMapInstance.setZoom).toHaveBeenCalledWith(12);
    expect(mockMapInstance.fitBounds).not.toHaveBeenCalled();
  });

  it("regionSelected 면 userLocation 있어도 fitBounds (GPS 무시)", () => {
    render(
      <SearchClusterMap
        complexes={[complex("1", "래미안1", 37.5, 127.0), complex("2", "래미안2", 37.6, 127.1)]}
        userLocation={{ lat: 35.1, lng: 129.0 }}
        regionSelected
      />,
    );
    expect(mockMapInstance.fitBounds).toHaveBeenCalled();
  });

  it("userLocation 없으면 기존처럼 검색 결과 fitBounds", () => {
    render(
      <SearchClusterMap
        complexes={[complex("1", "래미안1", 37.5, 127.0), complex("2", "래미안2", 37.6, 127.1)]}
      />,
    );
    expect(mockMapInstance.fitBounds).toHaveBeenCalled();
  });

  it("언마운트 시 idle 리스너를 제거하고 마커를 지도에서 뗀다 (지도 destroy 는 안 함)", () => {
    currentZoom = 12;
    const { unmount } = render(
      <SearchClusterMap complexes={[complex("1", "래미안", 37.5, 127.0)]} />,
    );
    const marker = pointMarkers()[0];

    unmount();

    expect(mockRemoveListener).toHaveBeenCalled();
    expect(marker.setMap).toHaveBeenCalledWith(null);
  });

  it("네이버 지도 Client ID 미설정 시 에러 안내를 표시한다", () => {
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "");
    render(<SearchClusterMap complexes={[complex("1", "래미안", 37.5, 127.0)]} />);
    expect(screen.getByText("지도를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(mockMapConstructor).not.toHaveBeenCalled();
  });
});
