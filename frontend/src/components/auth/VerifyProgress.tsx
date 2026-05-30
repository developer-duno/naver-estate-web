/**
 * 중개사 인증 진행 단계 표시 (spec line 363 "검증 단계 가시화" 충족)
 * 4단계: 가입 → 이메일 인증 → 자격증 제출 → 관리자 승인
 *
 * Why 자체 구현 (Stepperize 등 OSS 도입 X):
 *   단일 사용처 (verify 페이지) = 8k★ 라이브러리 over-engineering 회피
 *   lucide 아이콘 + Tailwind 만 사용 = ~35 라인
 */
import { CircleCheckBig, Circle, Clock } from "lucide-react";

export type VerifyStep = "signup" | "email_confirm" | "license_submit" | "admin_approve";

const STEPS: { key: VerifyStep; label: string }[] = [
  { key: "signup", label: "가입" },
  { key: "email_confirm", label: "이메일 인증" },
  { key: "license_submit", label: "자격증 제출" },
  { key: "admin_approve", label: "관리자 승인" },
];

interface Props {
  currentStep: VerifyStep;
}

export function VerifyProgress({ currentStep }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  return (
    <ol
      className="flex items-center justify-between gap-2 mb-6"
      aria-label="중개사 인증 진행 상태"
    >
      {STEPS.map((step, i) => {
        const status = i < currentIdx ? "done" : i === currentIdx ? "current" : "pending";
        const Icon = status === "done" ? CircleCheckBig : status === "current" ? Clock : Circle;
        return (
          <li
            key={step.key}
            className="flex flex-col items-center text-xs gap-1"
            aria-current={status === "current" ? "step" : undefined}
          >
            <Icon
              className={`h-5 w-5 ${
                status === "done"
                  ? "text-accent-green"
                  : status === "current"
                    ? "text-accent-blue"
                    : "text-gray-300"
              }`}
              aria-hidden="true"
            />
            <span
              className={
                status === "current"
                  ? "text-accent-blue font-medium"
                  : status === "done"
                    ? "text-accent-green"
                    : "text-gray-400"
              }
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
