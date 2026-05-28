"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/login` },
      );

      if (resetError) {
        setError(
          resetError.message === "For security purposes, you can only request this after 60 seconds."
            ? "보안상 60초 후에 다시 요청할 수 있습니다."
            : "비밀번호 재설정 이메일 발송에 실패했습니다.",
        );
      } else {
        setSent(true);
      }
    } catch {
      setError("요청 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-md sm:max-w-lg mx-auto px-3 sm:px-4 py-8 sm:py-16 text-center">
        <div className="bg-white rounded-lg shadow-sm border p-6 sm:p-8">
          <div className="text-4xl mb-4">&#9993;</div>
          <h1 className="text-xl font-bold mb-3">이메일을 확인해주세요</h1>
          <p className="text-sm text-gray-600 mb-2">
            <strong>{email}</strong>으로 비밀번호 재설정 링크를 보냈습니다.
            메일함을 확인해주세요.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            링크는 1시간 후 만료됩니다.
          </p>
          <Link href="/login" className="text-sm text-accent-blue hover:underline">
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md sm:max-w-lg mx-auto px-3 sm:px-4 py-8 sm:py-16">
      <h1 className="text-2xl font-bold text-center mb-8">비밀번호 찾기</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 space-y-4">
        <p className="text-sm text-gray-600">
          가입 시 사용한 이메일 주소를 입력하면 비밀번호 재설정 링크를 보내드립니다.
        </p>

        {error && (
          <div role="alert" className="text-sm bg-red-50 text-red-600 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="email@example.com"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent-blue text-white py-2.5 rounded-md text-sm font-medium hover:bg-accent-blue/90 transition-colors disabled:bg-gray-300"
        >
          {loading ? "발송 중..." : "재설정 링크 보내기"}
        </button>

        <p className="text-center text-sm text-gray-500">
          <Link href="/login" className="text-accent-blue hover:underline">
            로그인으로 돌아가기
          </Link>
        </p>
      </form>
    </div>
  );
}
