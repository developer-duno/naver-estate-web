"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminToken } from "@/hooks/useAdminToken";
import { getAdminSettings, updateAdminSetting } from "@/lib/api";
import type { AdminSetting } from "@/types/admin";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const getToken = useAdminToken();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getAdminSettings(token);
      setSettings(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "설정 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const startEdit = (setting: AdminSetting) => {
    setEditingKey(setting.key);
    setEditValue(JSON.stringify(setting.value, null, 2));
  };

  const handleSave = async () => {
    if (!editingKey) return;
    setSaving(true);
    setError("");
    try {
      const parsed = JSON.parse(editValue);
      const token = await getToken();
      await updateAdminSetting(token, editingKey, parsed);
      setEditingKey(null);
      await loadSettings();
    } catch (e) {
      if (e instanceof SyntaxError) {
        setError("JSON 형식이 올바르지 않습니다");
      } else {
        setError(e instanceof Error ? e.message : "저장 실패");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">시스템 설정</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      {loading ? (
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
                      disabled={saving}
                      className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? "저장 중..." : "저장"}
                    </button>
                    <button
                      onClick={() => setEditingKey(null)}
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
