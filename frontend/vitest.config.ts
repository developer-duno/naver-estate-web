import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next 내장 server-only(npm 패키지 없음) — 시험에선 빈 모듈로(세션 483 PR 3b)
      "server-only": path.resolve(__dirname, "./node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
});
