"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAdminOpinion, resendOpinionMail, updateAdminOpinion } from "@/lib/api";
import type { AdminOpinion, AdminOpinionUpdatePayload, AdminOpinionUpdateResult, OpinionStatus } from "@/lib/api/opinions";
import { queryKeys } from "@/lib/query-keys";
import { ADMIN_STATUS_LABELS, OPINION_INTEREST_LABELS } from "@/lib/opinion-labels";

type Action =
  | { type: "update"; what: "reply" | "public" | "status"; payload: AdminOpinionUpdatePayload }
  | { type: "resend" }
  | { type: "delete" };

type ActionResult =
  | { type: "update"; row: AdminOpinionUpdateResult }
  | { type: "resend"; sent: boolean }
  | { type: "delete" };

const MAIL_FAILED = "메일은 못 보냈어요 — 다시 보내기";

/** 답장 저장 뒤 쪽지 — mail_sent 와 행 상태로 무슨 일이 있었는지 알려 준다 */
function replyNote(r: AdminOpinionUpdateResult): string {
  if (!r.reply) return "답장을 지웠어요";
  if (r.mail_sent) return "메일도 보냈어요";
  if (!r.user_email) return "로그인 안 한 분이라 메일은 없어요";
  if (r.reply_mail_sent) return "메일은 처음 답할 때 이미 보냈어요";
  return MAIL_FAILED;
}

/**
 * 관리자 의견함 — 펼친 한 줄의 편집 칸 (세션 437 PR C).
 * 저장·다시 보내기·지우기는 한 뮤테이션으로 묶어, 하나가 도는 동안 이 줄의 버튼을 전부 잠근다
 * (두 번 누르면 답장 메일이 두 통 갈 수 있다 — PR A 검사관 🟡6). 같은 틱의 연타는 ref 로 한 번 더 막는다.
 */
export default function OpinionEditor({
  opinion,
  getToken,
}: {
  opinion: AdminOpinion;
  getToken: () => Promise<string>;
}) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState(opinion.reply ?? "");
  const [isPublic, setIsPublic] = useState(opinion.is_public);
  const [publicTitle, setPublicTitle] = useState(opinion.public_title ?? "");
  const [publicAnswer, setPublicAnswer] = useState(opinion.public_answer ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  // 마지막 서버 응답 — 목록이 다시 불려 와 더 새 행이 오면 그쪽을 쓴다
  const [latest, setLatest] = useState<AdminOpinion | null>(null);
  const lock = useRef(false);

  const view = latest && latest.updated_at >= opinion.updated_at ? latest : opinion;

  const mutation = useMutation<ActionResult, Error, Action>({
    mutationFn: async (action) => {
      const token = await getToken();
      if (action.type === "update") {
        return { type: "update", row: await updateAdminOpinion(token, opinion.id, action.payload) };
      }
      if (action.type === "resend") {
        return { type: "resend", sent: (await resendOpinionMail(token, opinion.id)).sent };
      }
      await deleteAdminOpinion(token, opinion.id);
      return { type: "delete" };
    },
    onSuccess: (result, action) => {
      if (result.type === "update" && action.type === "update") {
        setLatest(result.row);
        if (action.what === "reply") setNote(replyNote(result.row));
        else if (action.what === "public")
          setNote(result.row.is_public ? "공개했어요 — 목록에 보이기까지 몇 분 걸릴 수 있어요" : "공개 목록에서 내렸어요");
        else setNote("상태를 바꿨어요");
      } else if (result.type === "resend") {
        if (result.sent) setLatest({ ...view, reply_mail_sent: true });
        setNote(result.sent ? "메일을 다시 보냈어요" : MAIL_FAILED);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.opinions() });
    },
    onError: (e) => setError(e.message),
  });

  const busy = mutation.isPending;

  function run(action: Action) {
    if (lock.current) return;
    lock.current = true;
    setNote("");
    setError("");
    mutation.mutate(action, {
      onSettled: () => {
        lock.current = false;
      },
    });
  }

  // 자동 오류 행은 사람이 보낸 글이 아니라 답장·공개가 없다(서버도 공개를 400 으로 막는다 — 세션 439)
  const isError = view.kind === "error";
  const canResend = !!view.user_email && !!view.reply && !view.reply_mail_sent;
  const publicIncomplete = isPublic && (!publicTitle.trim() || !publicAnswer.trim());
  const interests = view.interests?.length
    ? view.interests.map((i) => OPINION_INTEREST_LABELS[i] ?? i).join(" · ")
    : "고르지 않음";

  return (
    <div className="space-y-4 bg-gray-50 p-4 text-sm">
      <section>
        <h4 className="font-medium text-gray-800">보낸 내용</h4>
        <p className="mt-1 whitespace-pre-line text-gray-700">{view.message ?? "원문은 1년이 지나 지워졌어요"}</p>
        {!isError && <p className="mt-1 text-xs text-gray-500">궁금한 소식: {interests}</p>}
      </section>

      {!isError && (
        <>
          <section className="space-y-2">
            <label className="block font-medium text-gray-800" htmlFor={`reply-${opinion.id}`}>
              답장
            </label>
            <textarea
              id={`reply-${opinion.id}`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={5000}
              rows={4}
              disabled={busy}
              className="w-full rounded border bg-white p-2"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => run({ type: "update", what: "reply", payload: { reply } })}
                disabled={busy}
                className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-40"
              >
                답장 저장
              </button>
              {canResend && (
                <button
                  type="button"
                  onClick={() => run({ type: "resend" })}
                  disabled={busy}
                  className="rounded border px-3 py-1.5 disabled:opacity-40"
                >
                  메일 다시 보내기
                </button>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <label className="flex items-center gap-2 font-medium text-gray-800">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={busy}
              />
              &quot;고쳤습니다&quot; 목록에 공개
            </label>
            <input
              aria-label="공개 제목"
              placeholder="공개 제목"
              value={publicTitle}
              onChange={(e) => setPublicTitle(e.target.value)}
              maxLength={200}
              disabled={busy}
              className="w-full rounded border bg-white p-2"
            />
            <textarea
              aria-label="공개 답"
              placeholder="공개 답 (손님 글·이메일은 넣지 마세요)"
              value={publicAnswer}
              onChange={(e) => setPublicAnswer(e.target.value)}
              maxLength={5000}
              rows={3}
              disabled={busy}
              className="w-full rounded border bg-white p-2"
            />
            <button
              type="button"
              onClick={() =>
                run({
                  type: "update",
                  what: "public",
                  payload: { is_public: isPublic, public_title: publicTitle, public_answer: publicAnswer },
                })
              }
              disabled={busy || publicIncomplete}
              className="rounded border px-3 py-1.5 disabled:opacity-40"
            >
              공개 설정 저장
            </button>
            {publicIncomplete && <p className="text-xs text-gray-500">공개하려면 공개 제목과 공개 답을 모두 써 주세요.</p>}
          </section>
        </>
      )}

      <section className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-gray-800">상태</span>
          <select
            aria-label="상태 바꾸기"
            value={view.status}
            onChange={(e) =>
              run({ type: "update", what: "status", payload: { status: e.target.value as OpinionStatus } })
            }
            disabled={busy}
            className="rounded border bg-white px-2 py-1"
          >
            {(Object.keys(ADMIN_STATUS_LABELS) as OpinionStatus[]).map((s) => (
              <option key={s} value={s}>
                {ADMIN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("이 의견을 지울까요? 되돌릴 수 없어요")) run({ type: "delete" });
          }}
          disabled={busy}
          className="ml-auto rounded border border-red-200 px-3 py-1.5 text-red-700 disabled:opacity-40"
        >
          지우기
        </button>
      </section>

      {busy && <p role="status" className="text-xs text-gray-500">저장하는 중…</p>}
      {note && <p className="text-sm text-blue-700">{note}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
