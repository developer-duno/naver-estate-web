/**
 * MbClusterMap 컴포넌트 테스트 — naver.maps mock (다중 마커 + InfoWindow + Event)
 * 실행: npx vitest run src/components/mb/__tests__/MbClusterMap.test.tsx
 *
 * MbLocationMap.test.tsx 의 installNaverMock 패턴 답습 + 다중 마커/이벤트/바운즈 mock 확장.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import MbClusterMap from "../MbClusterMap";
import type { MbApartment } from "@/types";

// ⚠️ naver SDK 의 Map/Marker/LatLng 등은 클래스(생성자)다. 컴포넌트가 `new naver.maps.X()`
// 로 호출하므로 mock 도 `new` 가능해야 한다 — 화살표 함수는 생성자로 못 써서 TypeError.
// 일반 function 표현식으로 mockImplementation 을 줘 `new` 호환을 보장한다.
const mockMapInstance = { fitBounds: vi.fn(), setCenter: vi.fn(), setZoom: vi.fn() };
const mockMapConstructor = vi.fn(function () {
  return mockMapInstance;
});
const mockMarkerConstructor = vi.fn(function (opts) {
  return { setMap: vi.fn(), getPosition: vi.fn(), _opts: opts };
});
const mockLatLngConstructor = vi.fn(function (lat, lng) {
  return { lat, lng };
});
const mockBoundsExtend = vi.fn();
const mockLatLngBoundsConstructor = vi.fn(function () {
  return { extend: mockBoundsExtend };
});
const mockInfoWindowOpen = vi.fn();
const mockInfoWindowSetContent = vi.fn();
const mockInfoWindowConstructor = vi.fn(function () {
  return {
    open: mockInfoWindowOpen,
    close: vi.fn(),
    setContent: mockInfoWindowSetContent,
    setPosition: vi.fn(),
  };
});
// click 핸들러를 저장해 테스트에서 직접 호출 (마커 클릭 시뮬레이션)
const eventHandlers: Array<() => void> = [];
const mockAddListener = vi.fn().mockImplementation((_target, _event, handler) => {
  eventHandlers.push(handler);
  return { eventName: _event };
});

function installNaverMock() {
  Object.defineProperty(window, "naver", {
    value: {
      maps: {
        Map: mockMapConstructor,
        Marker: mockMarkerConstructor,
        LatLng: mockLatLngConstructor,
        LatLngBounds: mockLatLngBoundsConstructor,
        InfoWindow: mockInfoWindowConstructor,
        Point: vi.fn(),
        Event: { addListener: mockAddListener, removeListener: vi.fn() },
      },
    },
    writable: true,
    configurable: true,
  });
}

function apt(id: string, name: string, latitude?: number, longitude?: number): MbApartment {
  return { id, name, region: "서울", latitude, longitude };
}

describe("MbClusterMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.length = 0;
    installNaverMock();
  });

  /** 좌표 있는 단지마다 마커 생성 + 2개 이상이면 fitBounds */
  it("좌표가 있는 단지마다 마커를 생성하고 fitBounds로 줌을 맞춘다", () => {
    render(
      <MbClusterMap
        apartments={[apt("a", "래미안", 37.5, 127.0), apt("b", "자이", 37.6, 127.1)]}
      />,
    );
    expect(mockMarkerConstructor).toHaveBeenCalledTimes(2);
    expect(mockMapInstance.fitBounds).toHaveBeenCalled();
  });

  /** 좌표 NULL 단지는 마커에서 제외 (표는 부모가 전체 표시) */
  it("위경도가 없는 단지는 마커를 만들지 않는다", () => {
    render(
      <MbClusterMap
        apartments={[
          apt("a", "래미안", 37.5, 127.0),
          apt("b", "좌표없음", undefined, undefined),
          apt("c", "위도만", 37.7, undefined),
        ]}
      />,
    );
    // 좌표 둘 다 있는 단지(a)만 마커 1개
    expect(mockMarkerConstructor).toHaveBeenCalledTimes(1);
  });

  /** 마커 클릭 시 InfoWindow 표시 + onSelect 호출 */
  it("마커를 클릭하면 InfoWindow를 열고 onSelect를 호출한다", () => {
    const onSelect = vi.fn();
    const target = apt("a", "래미안", 37.5, 127.0);
    render(<MbClusterMap apartments={[target]} onSelect={onSelect} />);
    // 등록된 click 핸들러 직접 호출 (마커 클릭 시뮬레이션)
    expect(eventHandlers).toHaveLength(1);
    eventHandlers[0]();
    expect(mockInfoWindowSetContent).toHaveBeenCalled();
    expect(mockInfoWindowOpen).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(target);
  });

  /** InfoWindow content 는 단지명을 이스케이프해 XSS 차단 */
  it("단지명에 HTML 특수문자가 있어도 이스케이프한다", () => {
    render(<MbClusterMap apartments={[apt("a", '<img src=x onerror="alert(1)">', 37.5, 127.0)]} />);
    eventHandlers[0]();
    const content = mockInfoWindowSetContent.mock.calls[0][0] as string;
    expect(content).not.toContain("<img");
    expect(content).toContain("&lt;img");
  });

  /** 좌표 있는 단지가 0개면 안내 메시지 표시 */
  it("좌표가 있는 단지가 없으면 안내 메시지를 보여준다", () => {
    render(<MbClusterMap apartments={[apt("a", "좌표없음", undefined, undefined)]} />);
    expect(screen.getByText("표시할 위치 정보가 있는 단지가 없어요.")).toBeInTheDocument();
    expect(mockMarkerConstructor).not.toHaveBeenCalled();
  });

  /** SDK 미로드 시 에러 없이 렌더링 */
  it("naver SDK가 없으면 에러 없이 처리한다", () => {
    Object.defineProperty(window, "naver", { value: undefined, writable: true, configurable: true });
    expect(() => {
      render(<MbClusterMap apartments={[apt("a", "래미안", 37.5, 127.0)]} />);
    }).not.toThrow();
  });

  /**
   * 사고 박제 (MbLocationMap 답습): Map 생성자 throw 시 빈 회색 박스 대신 명시 안내.
   */
  it("Map 생성자가 throw 하면 안내 메시지가 표시된다", async () => {
    mockMapConstructor.mockImplementationOnce(() => {
      throw new Error("SDK init failed");
    });
    render(<MbClusterMap apartments={[apt("a", "래미안", 37.5, 127.0)]} />);
    await waitFor(() => {
      expect(screen.getByText("지도를 불러오지 못했습니다.")).toBeInTheDocument();
    });
  });
});
