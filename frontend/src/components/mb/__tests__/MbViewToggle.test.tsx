/**
 * MbViewToggle 테스트 — 목록/지도 토글 + MAP_ENABLED graceful degradation
 * 실행: npx vitest run src/components/mb/__tests__/MbViewToggle.test.tsx
 *
 * MAP_ENABLED 는 constants.ts 모듈 상수(빌드타임 env)라 vi.mock 으로 분기 주입.
 * 다른 상수(PAGE_SIZE 등) 보존 위해 importActual partial mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MAP_ENABLED 를 테스트마다 바꾸기 위해 가변 참조로 mock
let mapEnabled = true;
vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/constants")>("@/lib/constants");
  return { ...actual, get MAP_ENABLED() { return mapEnabled; } };
});

import MbViewToggle from "../MbViewToggle";

describe("MbViewToggle", () => {
  beforeEach(() => {
    mapEnabled = true;
  });

  it("MAP_ENABLED=true 면 목록/지도 토글을 렌더한다", () => {
    render(<MbViewToggle viewMode="list" onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /목록/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /지도/ })).toBeInTheDocument();
  });

  it("MAP_ENABLED=false 면 아무것도 렌더하지 않는다 (graceful degradation)", () => {
    mapEnabled = false;
    const { container } = render(<MbViewToggle viewMode="list" onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("현재 viewMode 버튼이 aria-selected 다", () => {
    render(<MbViewToggle viewMode="map" onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /지도/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /목록/ })).toHaveAttribute("aria-selected", "false");
  });

  it("다른 모드 클릭 시 onChange 를 호출한다", () => {
    const onChange = vi.fn();
    render(<MbViewToggle viewMode="list" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /지도/ }));
    expect(onChange).toHaveBeenCalledWith("map");
  });
});
