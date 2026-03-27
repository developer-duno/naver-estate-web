"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import { getAdminSettings, updateAdminSetting } from "@/lib/api";
import type { AdminSetting } from "@/types/admin";

export default function AdminSettingsPage() {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [jsonError, setJsonError] = useState("");

  const { token, getToken } = useTokenReady();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery<{ items: AdminSetting[] }, Error>({
    queryKey: queryKeys.admin.settings(),
    queryFn: () => getAdminSettings(token),
    enabled: !!token,
    staleTime: 0,
  });

  const updateMutation = useMutation<
    { status: string },
    Error,
    { key: string; value: Record<string, unknown> }
  >({
    mutationFn: async ({ key, value }) => {
      const t = await getToken();
      return updateAdminSetting(t, key, value);
    },
    onSuccess: () => {
      setEditingKey(null);
      setJsonError("");
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });

  const error = settingsQuery.error?.message ?? updateMutation.error?.message ?? jsonError ?? "";
  const settings = settingsQuery.data?.items ?? [];

  const startEdit = (setting: AdminSetting) => {
    setEditingKey(setting.key);
    setEditValue(JSON.stringify(setting.value, null, 2));
    setJsonError("");
  };

  const handleSave = () => {
    if (!editingKey) return;
    setJsonError("");
    try {
      const parsed = JSON.parse(editValue);
      updateMutation.mutate({ key: editingKey, value: parsed });
    } catch {
      setJsonError("JSON 형식이 올바르지 않습니다");
    }
  };

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">시스템 설정</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      {settingsQuery.isLoading ? (
        <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
      ) : settings.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">등록된 설정이 없습니다</div>
      ) : (
        <div className="space-y-3">
          {settings.map((s) => (
            <div key={s.key} className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{s.key}</span>
                <div className="flex items-center gap-2">
                  {s.updated_at && (
                    <span className="text-xs text-gray-500">
                      {new Date(s.updated_at).toLocaleString("ko")}
                    </span>
                  )}
                  {editingKey !== s.key && (
                    <button
                      onClick={() => startEdit(s)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      편집
                    </button>
                  )}
                </div>
              </div>

              {editingKey === s.key ? (
                <div>
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={4}
                    className="w-full text-xs font-mono border rounded p-2 mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                      className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {updateMutation.isPending ? "저장 중..." : "저장"}
                    </button>
                    <button
                      onClick={() => { setEditingKey(null); setJsonError(""); }}
                      className="text-xs px-3 py-1 border rounded hover:bg-gray-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <pre className="text-xs text-gray-500 bg-gray-50 rounded p-2 overflow-x-auto">
                  {JSON.stringify(s.value, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
