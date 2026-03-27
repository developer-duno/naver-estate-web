/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** 테스트용 QueryClient — retry 비활성, gcTime 0 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** 테스트용 QueryClientProvider 래퍼 */
export function TestQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(createTestQueryClient);
  return React.createElement(QueryClientProvider, { client }, children);
}

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock next/link — children을 <a>로 감싸서 반환
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => {
    const React = require("react");
    return React.createElement("a", { href, ...props }, children);
  },
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: any) => {
    const React = require("react");
    const { fill, priority, ...rest } = props;
    return React.createElement("img", rest);
  },
}));

// Mock next/dynamic
vi.mock("next/dynamic", () => ({
  default: (loader: any) => {
    const React = require("react");
    return function DynamicComponent() { return null; };
  },
}));

// Mock @/lib/supabase
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      signOut: vi.fn().mockResolvedValue({}),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    }),
  }),
}));
