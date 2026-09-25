"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import { getAdminSettings, updateAdminSetting } from "@/lib/api";
import {
  getSettingLabel,
  getSettingGroup,
  SETTING_GROUP_TITLES,
  type SettingGroup,
} from "@/lib/admin/setting-labels";
import type { AdminSetting } from "@/types/admin";

/** 묶음이 화면에 나오는 순서 */
const GROUP_ORDER: SettingGroup[] = ["crawl", "other"];

/** 확인창에 보일 값 한 줄 (긴 값은 잘라서) */
function oneLine(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

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

  const handleSave = (setting: AdminSetting) => {
    setJsonError("");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editValue);
    } catch {
      setJsonError("값의 형식이 올바르지 않아요. 따옴표·괄호가 빠지지 않았는지 확인해 주세요");
      return;
    }
    // 되돌리기 어려운 조작 — 저장 전에 이전 값 → 새 값을 한 번 더 보여 준다
    const name = getSettingLabel(setting.key)?.name ?? setting.key;
    const ok = confirm(
      [`"${name}" 값을 바꿀까요?`, `이전 값: ${oneLine(setting.value)}`, `새 값: ${oneLine(parsed)}`].join("\n"),
    );
    if (!ok) return;
    updateMutation.mutate({ key: setting.key, value: parsed });
  };

  const renderSetting = (s: AdminSetting) => {
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
              aria-label={`${label?.name ?? s.key} 새 값`}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={4}
              className="w-full text-xs font-mono border rounded p-2 mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSave(s)}
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
  };

  return (
    <>
      <h2 className="text-lg font-semibold mb-2">시스템 설정</h2>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
        수집 속도·묶음 크기처럼 서비스가 돌아가는 방식을 적어 두는 값이에요. 값은 원본 형식
        그대로 보여줘요 — 뜻을 모르는 값은 그대로 두는 게 안전해요.
      </p>

      {/*
        경고 배너 — 2026-09-25 실측: 백엔드에서 admin_settings 를 읽는 곳은 관리자 조회·저장
        라우터(routers/admin/data.py)뿐이라, 저장해도 자동 수집 동작은 바뀌지 않는다.
        "저장 즉시 서버 동작에 반영"이라고 쓰면 거짓이 되므로 사실대로 알린다.
      */}
      <div
        role="note"
        className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 mb-4 leading-relaxed"
      >
        <strong>저장 전에 읽어 주세요.</strong> 여기 값은 저장하면 바로 기록되고, 누가 언제 바꿨는지 &lsquo;감사 로그&rsquo;에
        남아요. 다만 지금 서버의 자동 수집은 이 값을 읽지 않아요 — 수집 속도·양은 서버 설정 파일이 정해요.
        그래서 여기서 바꿔도 당장 수집이 빨라지거나 멈추지는 않아요.
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      {settingsQuery.isLoading ? (
        <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
      ) : settings.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">등록된 설정이 없습니다</div>
      ) : (
        <div className="space-y-6">
          {GROUP_ORDER.map((group) => {
            const inGroup = settings.filter((s) => getSettingGroup(s.key) === group);
            if (inGroup.length === 0) return null;
            return (
              <section key={group} aria-labelledby={`setting-group-${group}`}>
                <h3
                  id={`setting-group-${group}`}
                  className="text-sm font-semibold text-gray-700 mb-2"
                >
                  {SETTING_GROUP_TITLES[group]}
                </h3>
                <div className="space-y-3">{inGroup.map(renderSetting)}</div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
