"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { SkeletonPage } from "@/components/Skeleton";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        const newFailCount = failCount + 1;
        setFailCount(newFailCount);

        const msg = authError.message;
        let translated =
          msg === "Invalid login credentials" ? "이메일 또는 비밀번호가 올바르지 않습니다." :
          msg === "Email not confirmed" ? "이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요." :
          msg.startsWith("Too many requests") ? "너무 많은 요청입니다. 15분 후 다시 시도해주세요." :
          msg;

        if (newFailCount >= 5) {
          translated = "로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.";
        } else if (newFailCount >= 3) {
          translated += ` (${5 - newFailCount}회 남음)`;
        }

        setError(translated);
      } else {
        setFailCount(0);
        // 로그인 기록 업데이트 (실패해도 로그인은 차단하지 않음)
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            if (apiUrl) {
              await fetch(`${apiUrl}/api/users/login-record`, {
                method: "POST",
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
            } else {
              // 백엔드 없이 Supabase 직접 업데이트
              await supabase.from("user_profiles").upsert({
                user_id: session.user.id,
                email: session.user.email || "",
                last_login_at: new Date().toISOString(),
              }, { onConflict: "user_id" });
            }
          }
        } catch (e) {
          // login-record 실패는 핵심 로그인 흐름 차단 안 함 (다음 화면으로 진행)
          // Why: 백엔드 다운 시에도 Supabase 직접 인증은 성공해야 사용자 차단 0
          console.error("[Login] login-record failed (non-blocking):", e);
        }
        const rawRedirect = searchParams.get("redirect") || "/";
        let redirectTo = "/";
        try {
          const url = new URL(rawRedirect, window.location.origin);
          if (url.origin === window.location.origin) redirectTo = url.pathname + url.search;
        } catch { /* invalid URL → default to / */ }
        router.push(redirectTo);
        router.refresh();
      }
    } catch {
      setError("로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const isLocked = failCount >= 5;

  return (
    <AuthLayout
      title="로그인"
      description="공인중개사 도구를 사용하려면 로그인해주세요"
    >
      <form onSubmit={handleLogin} className="space-y-4">
        {error && isLocked && (
          <Alert className="border-orange-200 bg-orange-50 text-orange-700 [&>svg]:text-orange-700">
            <Lock className="h-4 w-4" />
            <AlertTitle>계정 잠김</AlertTitle>
            <AlertDescription className="text-orange-700/90">{error}</AlertDescription>
          </Alert>
        )}
        {error && !isLocked && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="login-email">이메일</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLocked}
            aria-invalid={!!error || undefined}
            placeholder="email@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <Label htmlFor="login-password">비밀번호</Label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-500 hover:text-gray-700 p-1 -m-1"
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="sr-only">{showPassword ? "숨기기" : "표시"}</span>
            </button>
          </div>
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLocked}
            placeholder="비밀번호"
          />
        </div>

        <Button
          type="submit"
          disabled={loading || isLocked}
          className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white"
        >
          {loading ? "로그인 중..." : isLocked ? "계정 잠김" : "로그인"}
        </Button>

        <div className="flex justify-between text-sm text-gray-500">
          <Link href="/forgot-password" className="text-accent-blue hover:underline">
            비밀번호 찾기
          </Link>
          <span>
            계정이 없으신가요?{" "}
            <Link href="/signup" className="text-accent-blue hover:underline">
              회원가입
            </Link>
          </span>
        </div>
      </form>
    </AuthLayout>
  );
}
