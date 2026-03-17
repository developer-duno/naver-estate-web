"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" role="status" aria-label="로딩 중" /></div>}>
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
        } catch (e) { console.error("[Login] login-record failed:", e); }
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
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-center mb-8">로그인</h1>

      <form onSubmit={handleLogin} className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
        {error && (
          <div role="alert" className={`text-sm rounded-md px-3 py-2 ${isLocked ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-600"}`}>
            {isLocked && <span className="font-medium block mb-1">계정 잠김</span>}
            {error}
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLocked}
            aria-invalid={!!error || undefined}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            placeholder="email@example.com"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">비밀번호</label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {showPassword ? "숨기기" : "표시"}
            </button>
          </div>
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLocked}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            placeholder="비밀번호"
          />
        </div>

        <button
          type="submit"
          disabled={loading || isLocked}
          className="w-full bg-blue-600 text-white py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300"
        >
          {loading ? "로그인 중..." : isLocked ? "계정 잠김" : "로그인"}
        </button>

        <p className="text-center text-sm text-gray-500">
          계정이 없으신가요?{" "}
          <Link href="/signup" className="text-blue-600 hover:underline">
            회원가입
          </Link>
        </p>
      </form>
    </div>
  );
}
