"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

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
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">회원가입 완료</h1>
        <p className="text-gray-600 mb-4">
          이메일로 인증 링크를 보내드렸습니다. 이메일을 확인해주세요.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          공인중개사이신 경우 로그인 후 <strong>중개사 인증</strong>을 진행해주세요.
        </p>
        <Link href="/login" className="text-blue-600 hover:underline">
          로그인 페이지로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-center mb-8">회원가입</h1>

      <form onSubmit={handleSignup} className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 text-red-600 text-sm rounded-md px-3 py-2">{error}</div>
        )}

        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="8자 이상 (대문자+소문자+숫자+특수문자)"
          />
          {password && (
            <div className="mt-2">
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

        <div>
          <label htmlFor="signup-confirm" className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
          <input
            id="signup-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="비밀번호 재입력"
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-red-500 mt-1">비밀번호가 일치하지 않습니다</p>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="mt-0.5 rounded border-gray-300"
          />
          <span>
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">이용약관</a> 및{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">개인정보 처리방침</a>에 동의합니다
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={agreeMarketing}
            onChange={(e) => setAgreeMarketing(e.target.checked)}
            className="mt-0.5 rounded border-gray-300"
          />
          <span>(선택) 신규 도구·블로그 발행 알림을 이메일로 받겠습니다</span>
        </label>

        <button
          type="submit"
          disabled={loading || !agreeTerms}
          className="w-full bg-blue-600 text-white py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300"
        >
          {loading ? "가입 중..." : "회원가입"}
        </button>

        <p className="text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            로그인
          </Link>
        </p>
      </form>
    </div>
  );
}
