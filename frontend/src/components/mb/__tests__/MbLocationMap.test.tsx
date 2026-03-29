/**
 * MbLocationMap 컴포넌트 테스트 — naver.maps mock
 * 실행: npx vitest run src/components/mb/__tests__/MbLocationMap.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import MbLocationMap from "../MbLocationMap";

const mockMapConstructor = vi.fn();
const mockMarkerConstructor = vi.fn().mockReturnValue({ setMap: vi.fn() });
const mockLatLngConstructor = vi.fn();

function installNaverMock() {
  Object.defineProperty(window, "naver", {
    value: {
      maps: {
        Map: mockMapConstructor,
        Marker: mockMarkerConstructor,
        LatLng: mockLatLngConstructor,
      },
    },
    writable: true,
    configurable: true,
  });
}

describe("MbLocationMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installNaverMock();
  });

  /** SDK 로드 시 Map + Marker 생성 확인 */
  it("naver.maps SDK가 로드되면 Map과 Marker를 생성한다", () => {
    render(<MbLocationMap latitude={37.5} longitude={127.0} name="래미안" />);
    expect(mockLatLngConstructor).toHaveBeenCalledWith(37.5, 127.0);
    expect(mockMapConstructor).toHaveBeenCalled();
    expect(mockMarkerConstructor).toHaveBeenCalled();
  });

  /** SDK 미로드 시 에러 없이 렌더링 */
  it("naver SDK가 없으면 에러 없이 처리한다", () => {
    Object.defineProperty(window, "naver", { value: undefined, writable: true, configurable: true });
    expect(() => {
      render(<MbLocationMap latitude={37.5} longitude={127.0} />);
    }).not.toThrow();
  });
});
