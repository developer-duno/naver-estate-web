"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <AuthLayout title="재설정 링크 발송 요청 완료" hideBadges>
        <EmptyState
          icon={MailCheck}
          title="재설정 링크를 보냈어요"
          description={`${email}로 메일을 보냈을 거예요. 1시간 안에 도착합니다.`}
          action={
            <Button asChild variant="link" className="text-accent-blue">
              <Link href="/login">로그인으로 돌아가기</Link>
            </Button>
          }
        />
        <p className="text-xs text-gray-500 mt-3 text-center">
          등록된 이메일이면 메일이 도착합니다 (보안상 미등록 이메일도 동일 메시지가 표시됩니다).
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="비밀번호 재설정"
      description="가입 이메일로 재설정 링크를 보내드립니다"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="reset-email">이메일</Label>
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="email@example.com"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white"
        >
          {loading ? "발송 중..." : "재설정 링크 보내기"}
        </Button>

        <p className="text-center text-sm text-gray-500">
          <Link href="/login" className="text-accent-blue hover:underline">
            로그인으로 돌아가기
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
