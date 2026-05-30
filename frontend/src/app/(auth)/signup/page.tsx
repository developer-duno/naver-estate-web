"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>]/;

function getPasswordStrength(password: string): { level: number; label: string; color: string } {
  if (!password) return { level: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (SPECIAL_CHAR_REGEX.test(password)) score++;

  if (score <= 1) return { level: 1, label: "약함", color: "bg-red-500" };
  if (score <= 2) return { level: 2, label: "보통", color: "bg-orange-500" };
  if (score <= 3) return { level: 3, label: "강함", color: "bg-yellow-500" };
  return { level: 4, label: "매우 강함", color: "bg-green-500" };
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !SPECIAL_CHAR_REGEX.test(password)) {
      setError("비밀번호는 대문자, 소문자, 숫자, 특수문자를 각 1개 이상 포함해야 합니다.");
      return;
    }
    if (!agreeTerms) {
      setError("이용약관에 동의해주세요.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // 마케팅 동의 → Supabase user_metadata → BE deps.py 프로필 자동생성 시 저장 (V028)
        options: { data: { agree_marketing: agreeMarketing } },
      });

      if (authError) {
        const msg = authError.message;
        const translated =
          msg === "User already registered" ? "이미 등록된 이메일입니다." :
          msg.startsWith("Too many requests") ? "너무 많은 요청입니다. 잠시 후 다시 시도해주세요." :
          msg === "Signup requires a valid password" ? "유효한 비밀번호를 입력해주세요." :
          msg;
        setError(translated);
      } else {
        setSuccess(true);
      }
    } catch {
      setError("회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout title="가입 신청 접수" hideBadges>
        <EmptyState
          icon={UserPlus}
          title="가입 신청이 접수되었습니다"
          description="이메일 인증 후 로그인하면 중개사 인증을 진행할 수 있습니다."
          action={
            <Button asChild className="bg-accent-blue hover:bg-accent-blue/90 text-white">
              <Link href="/login">로그인 페이지로 이동</Link>
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="가입 신청"
      description="공인중개사 등록 후 7일 무료 체험을 시작합니다"
    >
      <form onSubmit={handleSignup} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="signup-email">이메일</Label>
          <Input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="email@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-password">비밀번호</Label>
          <Input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="8자 이상 (대문자+소문자+숫자+특수문자)"
          />
          {password && (
            <div>
              <div className="flex gap-1 mb-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i <= strength.level ? strength.color : "bg-gray-200"}`}
                  />
                ))}
              </div>
              <span className={`text-xs ${strength.level <= 1 ? "text-red-500" : strength.level <= 2 ? "text-orange-500" : "text-green-600"}`}>
                비밀번호 강도: {strength.label}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-confirm">비밀번호 확인</Label>
          <Input
            id="signup-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="비밀번호 재입력"
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-red-500">비밀번호가 일치하지 않습니다</p>
          )}
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="agree-terms"
            checked={agreeTerms}
            onCheckedChange={(v) => setAgreeTerms(v === true)}
            className="mt-0.5 data-[state=checked]:bg-accent-blue data-[state=checked]:border-accent-blue"
          />
          <div className="text-sm text-gray-600">
            <Label htmlFor="agree-terms" className="cursor-pointer font-normal">동의합니다 — </Label>
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent-blue underline">이용약관</Link>
            {" 및 "}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent-blue underline">개인정보 처리방침</Link>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="agree-marketing"
            checked={agreeMarketing}
            onCheckedChange={(v) => setAgreeMarketing(v === true)}
            className="mt-0.5 data-[state=checked]:bg-accent-blue data-[state=checked]:border-accent-blue"
          />
          <Label htmlFor="agree-marketing" className="cursor-pointer text-sm text-gray-600 font-normal">
            (선택) 신규 도구·블로그 발행 알림을 이메일로 받겠습니다
          </Label>
        </div>

        <Button
          type="submit"
          disabled={loading || !agreeTerms}
          className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white"
        >
          {loading ? "가입 중..." : "가입 신청"}
        </Button>

        <p className="text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-accent-blue hover:underline">
            로그인
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
