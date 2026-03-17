/**
 * useExport 훅 — 엑셀 내보내기 로직 캡슐화
 * complex/[no]/page.tsx에서 분리
 */
"use client";

import { useState, useCallback } from "react";
import { exportArticles } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import type { ArticleFilters } from "@/types";

interface ExportHookResult {
  exporting: boolean;
  exportError: string;
  clearExportError: () => void;
  handleExport: (
    complexNo: string,
    selectedArticleNos: Set<string>,
    currentFilters: ArticleFilters,
  ) => Promise<void>;
}

export function useExport(): ExportHookResult {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const clearExportError = useCallback(() => setExportError(""), []);

  const handleExport = useCallback(async (
    complexNo: string,
    selectedArticleNos: Set<string>,
    currentFilters: ArticleFilters,
  ) => {
    if (exporting) return;

    let accessToken: string | undefined;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      accessToken = session?.access_token ?? undefined;
    } catch (e) {
      console.error("[Export] auth session failed:", e);
    }

    setExporting(true);
    setExportError("");
    try {
      const exportFilters: ArticleFilters = selectedArticleNos.size > 0
        ? { selected_articles: [...selectedArticleNos].join(",") }
        : currentFilters;
      await exportArticles(complexNo, exportFilters, accessToken);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "엑셀 내보내기에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  return { exporting, exportError, clearExportError, handleExport };
}
