#!/usr/bin/env node
// PostToolUse(Bash) 훅 — backend PR 머지 직후 zombie 검증 자동 상기.
// 세션 257~311 내내 반복된 "BE 머지 후 라이브 zombie 미검증" 사고를 구조적으로 차단.
// release.md §2 cross-check 를 Claude 가 잊지 않게 머지 명령 직후 리마인더 주입(경고형, 차단 아님).
//
// 동작: 실행된 Bash 명령이 `gh pr merge` 면, 방금 갱신된 main 의 머지 커밋이
// backend/ 를 건드렸는지 git 으로 확인 → 건드렸으면 release-verify 안내, FE/md 전용이면 면제 안내.
const cp = require("child_process");

let input = "";
try {
  input = require("fs").readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

let cmd = "";
try {
  cmd = JSON.parse(input).tool_input?.command || "";
} catch {
  process.exit(0);
}

// gh pr merge 명령만 대상 (대소문자·옵션 무관)
if (!/gh\s+pr\s+merge/.test(cmd)) process.exit(0);

try {
  // 방금 머지된 HEAD 커밋이 바꾼 파일 목록 (squash 머지 = main 최신 1커밋)
  const files = cp
    .execSync("git diff-tree --no-commit-id --name-only -r HEAD", {
      cwd: process.cwd(),
      stdio: "pipe",
    })
    .toString();

  const touchesBackend = /(^|\n)backend\//.test(files);
  const onlyDocs = files
    .trim()
    .split("\n")
    .every((f) => /\.md$|^\.claude\/|^docs\//.test(f));

  if (touchesBackend && !onlyDocs) {
    console.error(
      "[zombie 리마인더] 방금 backend 변경 PR 을 머지했다. release.md §2 cross-check 의무:\n" +
        "  ① port 8002 PID 가 직전과 다른 새 값인지 (PID 변경 = ground truth)\n" +
        "  ② backend.log 첫 줄 부팅시각 + orchestrator.pid mtime 이 머지 시각 이후인지\n" +
        "  ③ 해당 API 라이브 GET 으로 새 동작 실측 (정적분석·pytest 로 대체 불가)\n" +
        "  → release-verify 스킬 발동. 옛 시각/PID 면 zombie → PC 재부팅 안내."
    );
  } else {
    console.error(
      "[zombie 리마인더] FE/md 전용 머지로 판단 — backend 가동 무관(release.md §5 면제). " +
        "혹시 backend 변경이 섞였으면 release-verify 수동 확인."
    );
  }
} catch {
  // git 호출 실패해도 작업 흐름 막지 않음
}
process.exit(0);
