/**
 * useExport 훅 — 엑셀 내보내기 로직 캡슐화 (useMutation 래핑)
 * complex/[no]/page.tsx에서 분리
 */
"use client";

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
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
  const [exportError, setExportError] = useState("");

  const clearExportError = useCallback(() => setExportError(""), []);

  const mutation = useMutation({
    mutationFn: async ({
      complexNo,
      selectedArticleNos,
      currentFilters,
    }: {
      complexNo: string;
      selectedArticleNos: Set<string>;
      currentFilters: ArticleFilters;
    }) => {
      let accessToken: string | undefined;
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token ?? undefined;
      } catch (e) {
        console.error("[Export] auth session failed:", e);
      }

      const exportFilters: ArticleFilters = selectedArticleNos.size > 0
        ? { selected_articles: [...selectedArticleNos].join(",") }
        : currentFilters;
      await exportArticles(complexNo, exportFilters, accessToken);
    },
    onError: (err: unknown) => {
      setExportError(err instanceof Error ? err.message : "엑셀 내보내기에 실패했습니다.");
    },
  });

  const handleExport = useCallback(async (
    complexNo: string,
    selectedArticleNos: Set<string>,
    currentFilters: ArticleFilters,
  ) => {
    if (mutation.isPending) return;
    setExportError("");
    mutation.mutate({ complexNo, selectedArticleNos, currentFilters });
  }, [mutation]);

  return {
    exporting: mutation.isPending,
    exportError,
    clearExportError,
    handleExport,
  };
}
