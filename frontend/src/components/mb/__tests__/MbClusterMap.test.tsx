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
const mockEventTrigger = vi.fn();

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
        Event: { addListener: mockAddListener, removeListener: vi.fn(), trigger: mockEventTrigger },
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

  /** 세션 318: 호갱노노식 HTML 가격 말풍선 마커 — markerKind 별 핵심 지표가 content 에 박힌다 */
  it("markerKind=presale 이면 마커 content 에 분양가(억)가 박힌다", () => {
    render(
      <MbClusterMap
        apartments={[{ id: "a", name: "래미안", region: "서울", latitude: 37.5, longitude: 127.0, presale_min_price: 46000 }]}
        markerKind="presale"
      />,
    );
    const opts = mockMarkerConstructor.mock.calls[0][0];
    expect(opts.icon.content).toContain("4억6,000만");
  });

  it("markerKind=unsold 이면 마커 content 에 미분양 호수가 박힌다", () => {
    render(
      <MbClusterMap
        apartments={[{ id: "a", name: "래미안", region: "서울", latitude: 37.5, longitude: 127.0, unsold: 120 }]}
        markerKind="unsold"
      />,
    );
    const opts = mockMarkerConstructor.mock.calls[0][0];
    expect(opts.icon.content).toContain("미분양120");
  });

  it("가격 정보 없으면 마커 content 폴백 = 단지명 (빈 말풍선 금지)", () => {
    render(
      <MbClusterMap
        apartments={[{ id: "a", name: "정보없는단지", region: "서울", latitude: 37.5, longitude: 127.0 }]}
        markerKind="presale"
      />,
    );
    const opts = mockMarkerConstructor.mock.calls[0][0];
    expect(opts.icon.content).toContain("정보없는단지");
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

  /** 결함 C 가드: 0,0 좌표(좌표 미상을 0으로 채운 데이터, 아프리카 앞바다)는 제외 */
  it("0,0 좌표 단지는 마커를 만들지 않는다", () => {
    render(
      <MbClusterMap
        apartments={[apt("a", "래미안", 37.5, 127.0), apt("z", "0좌표", 0, 0)]}
      />,
    );
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

  /** 가격 없는 단지: 마커도 InfoWindow도 단지명만이면 회색 마커+흰 말풍선에 같은 이름이
   * 겹쳐 보이는 중복(스크린샷 버그) → InfoWindow 에 지역을 함께 표시해 중복 대신 정보 추가. */
  it("InfoWindow content 에 지역(region)을 함께 표시한다 (단지명 중복표시 해소)", () => {
    // apt 팩토리는 region:"서울" — 가격 없는 단지라 마커는 단지명 폴백.
    render(<MbClusterMap apartments={[apt("a", "더샵관저아르테", 37.5, 127.0)]} />);
    eventHandlers[0]();
    const content = mockInfoWindowSetContent.mock.calls[0][0] as string;
    expect(content).toContain("더샵관저아르테"); // 단지명 (기존 유지)
    expect(content).toContain("서울"); // 지역 (신규 — 마커엔 없는 정보)
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

  // ── 위치 기준 줌 우선순위: region 선택 > GPS > 전국 fitBounds ──

  /** region 미선택 + GPS 좌표 있으면 내 위치 중심 + zoom 12 (fitBounds 아님) */
  it("userLocation 있고 regionSelected 아니면 내 위치로 setCenter+setZoom(12)", () => {
    render(
      <MbClusterMap
        apartments={[apt("a", "래미안", 37.5, 127.0), apt("b", "자이", 37.6, 127.1)]}
        userLocation={{ lat: 35.1, lng: 129.0 }}
      />,
    );
    expect(mockMapInstance.setCenter).toHaveBeenCalled();
    expect(mockMapInstance.setZoom).toHaveBeenCalledWith(12);
    expect(mockMapInstance.fitBounds).not.toHaveBeenCalled();
  });

  /** regionSelected true 면 GPS 좌표가 있어도 그 지역 fitBounds (명시 선택 우선) */
  it("regionSelected 면 userLocation 있어도 fitBounds (GPS 무시)", () => {
    render(
      <MbClusterMap
        apartments={[apt("a", "래미안", 37.5, 127.0), apt("b", "자이", 37.6, 127.1)]}
        userLocation={{ lat: 35.1, lng: 129.0 }}
        regionSelected
      />,
    );
    expect(mockMapInstance.fitBounds).toHaveBeenCalled();
  });

  /** GPS·region 둘 다 없으면 전국 fitBounds 폴백 */
  it("userLocation 없고 regionSelected 아니면 전국 fitBounds 폴백", () => {
    render(
      <MbClusterMap
        apartments={[apt("a", "래미안", 37.5, 127.0), apt("b", "자이", 37.6, 127.1)]}
      />,
    );
    expect(mockMapInstance.fitBounds).toHaveBeenCalled();
  });

  // 세션 317: GPS 좌표가 늦게(또는 또) 도착해도 카메라를 단 1회만 내 위치로 — 사용자 조작 강제 점프 방지
  it("GPS 좌표가 또 갱신돼도 setZoom(12) 센터링은 1회만 한다", () => {
    const items = [apt("a", "래미안", 37.5, 127.0), apt("b", "자이", 37.6, 127.1)];
    const { rerender } = render(
      <MbClusterMap apartments={items} userLocation={{ lat: 35.1, lng: 129.0 }} />,
    );
    expect(mockMapInstance.setZoom).toHaveBeenCalledTimes(1);
    // GPS 응답이 새 객체로 또 도착(혹은 사용자 조작 후 effect 재발동) — 추가 센터링 없어야 함
    rerender(<MbClusterMap apartments={items} userLocation={{ lat: 35.2, lng: 129.1 }} />);
    expect(mockMapInstance.setZoom).toHaveBeenCalledTimes(1);
  });

  // 세션 317: NCP 인증 실패(navermap_authFailure 전역 콜백)는 폴링으로 못 잡으므로 콜백→에러 UI 전환
  it("navermap_authFailure 콜백이 호출되면 에러 안내를 표시한다", async () => {
    render(<MbClusterMap apartments={[apt("a", "래미안", 37.5, 127.0)]} />);
    expect(typeof window.navermap_authFailure).toBe("function");
    window.navermap_authFailure!();
    await waitFor(() => {
      expect(screen.getByText("지도를 불러오지 못했습니다.")).toBeInTheDocument();
    });
  });

  // 세션 351: page.tsx(풀스크린 높이 클래스) 와 이 컴포넌트를 마운트하는 부모(MbApartmentsTab
  // 등)가 useMbViewMode() 를 독립 호출해 서로 다른 state 인스턴스를 갖는다 — 지도가 부모의
  // 높이 클래스가 실제 레이아웃으로 반영되기 전에 생성되면 컨테이너가 0~1px 로 굳는다.
  // idle 이벤트를 다음 프레임에 명시 트리거해 실제 컨테이너 크기로 재계산을 강제한다
  // (resize 트리거는 이 프로젝트에서 이미 무효로 실측된 방식 — SearchClusterMap 세션349).
  it("지도 생성 다음 프레임에 idle 이벤트를 트리거해 레이아웃 확정 후 재계산을 강제한다", async () => {
    render(<MbClusterMap apartments={[apt("a", "래미안", 37.5, 127.0)]} />);
    await waitFor(() => {
      expect(mockEventTrigger).toHaveBeenCalledWith(mockMapInstance, "idle");
    });
  });
});
