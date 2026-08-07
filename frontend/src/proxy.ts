import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 관리자 페이지 보호 대상 경로
const ADMIN_PATHS = ["/admin"];
// 로그인 필수 경로
const AUTH_REQUIRED_PATHS = ["/complex", "/verify"];
// 관리자 이메일 (환경변수 필수, 쉼표 구분 다중 지원, 미설정 시 관리자 접근 차단)
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean),
);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // 세션 자동 갱신 — Supabase 장애 시에도 공개 페이지는 정상 동작
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase 장애 시 미인증 상태로 처리
  }

  const pathname = request.nextUrl.pathname;

  // 관리자 경로 보호: 미인증 또는 admin 역할 아닌 경우 차단
  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminPath) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      if (!pathname.startsWith("/login") && !pathname.startsWith("/signup")) {
        loginUrl.searchParams.set("redirect", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
    // 관리자 이메일이 아니면 차단 (ADMIN_EMAIL 미설정 시 전원 차단)
    if (!ADMIN_EMAILS.has(user.email ?? "")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // 로그인 필수 경로 보호 (/complex/*)
  const isAuthRequired = AUTH_REQUIRED_PATHS.some((p) => pathname.startsWith(p));
  if (isAuthRequired && !user) {
    // TEMP DIAG (세션351 버그2 조사 — 원인 확정 후 제거): 로그인된 사용자가 지도에서
    // 단지 클릭 시 /login 으로 튕기는 결함 재현용. 이 요청이 어떤 쿠키를 들고 왔는지·
    // getUser() 판정이 왜 실패했는지 서버 로그(Vercel Functions 로그)로 남긴다.
    console.error("[DIAG-351]", {
      pathname,
      isRSC: request.headers.get("rsc"),
      nextUrl: request.headers.get("next-url"),
      cookieNames: request.cookies.getAll().map((c) => c.name),
      hasSbCookie: request.cookies.getAll().some((c) => c.name.startsWith("sb-")),
    });
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 로그인 사용자가 /login, /signup, /forgot-password 접근 시 홈으로 리다이렉트
  // /verify 는 인증 후만 접근 의도라 제외 (AUTH_REQUIRED_PATHS 에 포함)
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password";
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
