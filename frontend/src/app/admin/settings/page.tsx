"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import { getAdminSettings, updateAdminSetting } from "@/lib/api";
import { getSettingLabel } from "@/lib/admin/setting-labels";
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
    staleTime: 300_000,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.settings() });
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
      setJsonError("값의 형식(JSON)이 올바르지 않아요. 따옴표·괄호가 빠지지 않았는지 확인해 주세요");
    }
  };

  return (
    <>
      <h2 className="text-lg font-semibold mb-2">시스템 설정</h2>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
        수집 속도·묶음 크기처럼 서비스가 돌아가는 방식을 바꾸는 값이에요. 값은 고급 형식(JSON)
        그대로 보여줘요 — 뜻을 모르는 값은 그대로 두는 게 안전해요.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      {settingsQuery.isLoading ? (
        <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
      ) : settings.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">등록된 설정이 없습니다</div>
      ) : (
        <div className="space-y-3">
          {settings.map((s) => {
            const label = getSettingLabel(s.key);
            return (
            <div key={s.key} className="bg-white border rounded-lg p-4">
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex flex-col min-w-0">
                  {/* 한글 이름표가 있으면 크게, 원문 key 는 개발자 대조용으로 작게 병기 */}
                  <span className="text-sm font-medium text-gray-700">
                    {label?.name ?? s.key}
                  </span>
                  {label && (
                    <span className="text-[10px] text-gray-400 font-mono">{s.key}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
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

              {label && (
                <p className="text-xs text-gray-500 mb-2 leading-relaxed">{label.description}</p>
              )}

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
            );
          })}
        </div>
      )}
    </>
  );
}
