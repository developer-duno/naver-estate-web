"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useSessionToken } from "@/hooks/useSessionToken";
import { ApiError } from "@/lib/api/core";
import {
  submitOpinion,
  type OpinionInterest,
  type OpinionKind,
  type OpinionSubmitBody,
} from "@/lib/api/opinions";

/** 로그인하러 갔다 돌아올 때 쓰던 글을 잠시 맡겨 두는 칸(복원하면 바로 지운다) */
export const OPINION_DRAFT_KEY = "2u.opinion.draft";

const MIN_LEN = 10;
const MAX_LEN = 1000;

const KINDS: { value: OpinionKind; label: string }[] = [
  { value: "bug", label: "버그·오류" },
  { value: "data", label: "정보가 틀려요" },
  { value: "suggest", label: "건의·제안" },
  { value: "other", label: "기타" },
];

const INTERESTS: { value: OpinionInterest; label: string }[] = [
  { value: "market", label: "지역 매물·호가 흐름" },
  { value: "presale", label: "미분양·분양 일정" },
  { value: "tax", label: "세금·제도" },
  { value: "other", label: "기타" },
];

const FAIL_MSG = "지금은 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요";

interface Draft {
  kind: OpinionKind | "";
  message: string;
  interests: OpinionInterest[];
}

function readDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(OPINION_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      kind: KINDS.some((k) => k.value === d.kind) ? (d.kind as OpinionKind) : "",
      message: typeof d.message === "string" ? d.message.slice(0, MAX_LEN) : "",
      interests: Array.isArray(d.interests)
        ? d.interests.filter((v): v is OpinionInterest => INTERESTS.some((i) => i.value === v))
        : [],
    };
  } catch {
    // 개인 창·저장소 막힘 — 복원 없이 빈 창으로 연다
    return null;
  }
}

function clearDraft() {
  try {
    window.sessionStorage.removeItem(OPINION_DRAFT_KEY);
  } catch {
    // 저장소가 막혀 있으면 지울 것도 없다
  }
}

function saveDraft(draft: Draft) {
  try {
    window.sessionStorage.setItem(OPINION_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 저장소가 막혀 있으면 맡기지 못한다 — 로그인 이동 자체는 막지 않는다
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "의견 보내기" 창 (세션 433 의견함). 누구나 보낼 수 있고, 답장은 로그인한 분만 가입 이메일로 받는다.
 * 하루 한도(429)는 서버 문구를 그대로 보여 준다(submitOpinion 이 문구를 보존).
 */
export default function OpinionDialog({ open, onOpenChange }: Props) {
  const pathname = usePathname();
  const { sessionToken, tokenReady } = useSessionToken();
  const idBase = useId();

  // 이 창은 처음 열 때 만들어진다(OpinionButton 이 그때 불러옴) — 맡겨 둔 글이 있으면 첫 값으로 되살린다.
  // 읽기는 초기값에서, 지우기는 아래 effect 에서(초기값 함수는 개발 모드에서 두 번 불릴 수 있다).
  const [draft] = useState(readDraft);
  const [kind, setKind] = useState<OpinionKind | "">(draft?.kind ?? "");
  const [message, setMessage] = useState(draft?.message ?? "");
  const [interests, setInterests] = useState<OpinionInterest[]>(draft?.interests ?? []);
  const [agreed, setAgreed] = useState(false);
  const [website, setWebsite] = useState("");

  useEffect(() => {
    if (draft) clearDraft();
  }, [draft]);

  const reset = () => {
    clearDraft();
    setKind("");
    setMessage("");
    setInterests([]);
    setAgreed(false);
    setWebsite("");
  };

  const mutation = useMutation({
    mutationFn: (body: OpinionSubmitBody) => submitOpinion(body, sessionToken),
    onSuccess: (res) => {
      reset();
      onOpenChange(false);
      toast.success("보냈어요. 고맙습니다");
      if (sessionToken && !res.can_reply) {
        toast("답장을 받으려면 다시 로그인해 주세요");
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.statusCode === 429) {
        toast.error(err.message);
      } else {
        toast.error(FAIL_MSG);
      }
    },
  });

  const trimmedLen = message.trim().length;
  const canSubmit = kind !== "" && trimmedLen >= MIN_LEN && agreed && !mutation.isPending;
  const loggedOut = tokenReady && !sessionToken;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({
      kind,
      message: message.trim(),
      page_path: pathname || undefined,
      interests: interests.length > 0 ? interests : undefined,
      website,
    });
  };

  const toggleInterest = (value: OpinionInterest, checked: boolean) => {
    setInterests((prev) => (checked ? [...prev, value] : prev.filter((v) => v !== value)));
  };

  const loginHref = `/login?redirect=${encodeURIComponent(pathname || "/")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md" data-testid="opinion-dialog">
        <DialogHeader>
          <DialogTitle>의견 보내기</DialogTitle>
          <DialogDescription>불편한 점이나 바라는 점을 알려 주세요.</DialogDescription>
        </DialogHeader>

        {loggedOut && (
          <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800" data-testid="opinion-login-hint">
            답장을 받으려면 로그인해 주세요(답장은 가입 이메일로 갑니다).{" "}
            <Link
              href={loginHref}
              onClick={() => {
                saveDraft({ kind, message, interests });
                onOpenChange(false);
              }}
              className="font-medium underline underline-offset-2"
            >
              로그인
            </Link>
          </p>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">종류</legend>
            <RadioGroup
              value={kind}
              onValueChange={(v) => setKind(v as OpinionKind)}
              className="grid-cols-2"
              aria-label="의견 종류"
            >
              {KINDS.map((k) => (
                <Label key={k.value} htmlFor={`${idBase}-kind-${k.value}`} className="font-normal">
                  <RadioGroupItem id={`${idBase}-kind-${k.value}`} value={k.value} />
                  {k.label}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor={`${idBase}-message`}>내용</Label>
            <Textarea
              id={`${idBase}-message`}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
              maxLength={MAX_LEN}
              rows={5}
              placeholder="10자 이상 적어 주세요"
              aria-describedby={`${idBase}-count`}
            />
            <p id={`${idBase}-count`} className="text-right text-xs text-gray-500">
              {trimmedLen < MIN_LEN ? `${MIN_LEN - trimmedLen}자 더 적어 주세요 · ` : ""}
              남은 글자 {MAX_LEN - message.length}
            </p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">어떤 소식이 궁금하세요? (선택)</legend>
            <div className="grid grid-cols-2 gap-2">
              {INTERESTS.map((i) => (
                <Label key={i.value} htmlFor={`${idBase}-interest-${i.value}`} className="font-normal">
                  <Checkbox
                    id={`${idBase}-interest-${i.value}`}
                    checked={interests.includes(i.value)}
                    onCheckedChange={(c) => toggleInterest(i.value, c === true)}
                  />
                  {i.label}
                </Label>
              ))}
            </div>
            <p className="text-xs text-gray-500">준비 참고용이에요. 이 선택으로 소식을 보내지는 않아요</p>
          </fieldset>

          {/* 숨김 칸 — 사람에게는 화면·읽어 주기 모두 안 보인다. 자동 입력 프로그램만 채운다 */}
          <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
            <label htmlFor={`${idBase}-website`}>website</label>
            <input
              id={`${idBase}-website`}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          <Label htmlFor={`${idBase}-agree`} className="items-start font-normal leading-snug">
            <Checkbox
              id={`${idBase}-agree`}
              checked={agreed}
              onCheckedChange={(c) => setAgreed(c === true)}
              className="mt-0.5"
            />
            <span>
              (필수) 답장과 서비스 개선을 위해 의견 내용·보던 화면·브라우저 정보(로그인한 경우 가입
              이메일)를 1년 보관하는 데 동의합니다
            </span>
          </Label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
            <Button type="submit" disabled={!canSubmit} data-testid="opinion-submit">
              {mutation.isPending ? "보내는 중…" : "보내기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
