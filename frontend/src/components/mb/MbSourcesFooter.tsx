import { SOURCES_FOOTER_TEXT } from "./basis-text";

/** 미분양 상세 페이지 맨 끝 — 화면 값들의 자료 출처·법령 출처 한 단락 (세션 472) */
export function MbSourcesFooter() {
  return (
    <p className="text-xs leading-relaxed text-gray-500" data-testid="mb-sources-footer">
      {SOURCES_FOOTER_TEXT}
    </p>
  );
}
