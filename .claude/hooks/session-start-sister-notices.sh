#!/usr/bin/env bash
# 세션 시작 때 미분양(mibunyang)이 2u 에 보낸 공유 DB 통보(열린 이슈)를 한 줄로 보여 준다 (세션 459).
# 미분양 .github/workflows/notify-sister.yml 이 미분양 레포에 `cross-repo-notice` 이슈를 연다 — 닫음 = 읽음.
# 14일 동안 안 닫힌 통보는 `stale-unread` 라벨이 붙어 자동으로 닫히므로, 최근 14일에 그렇게 닫힌 수도 같이 센다.
# 종료코드는 항상 0(세션 시작을 막지 않는다) · 출력은 stdout 한 줄.

REPO="developer-duno/mibunyang"
fail() { echo "📬 미분양 통보 확인 못 함(gh 오류)"; exit 0; }

command -v gh >/dev/null 2>&1 || fail
# gh 활성 계정은 컴퓨터 전역 스위치라 다른 세션이 바꿔 놨을 수 있다 → 레포 주인 계정 토큰을 이 명령에만 쓴다(값은 출력하지 않음).
tok=$(gh auth token --user developer-duno 2>/dev/null) && [ -n "$tok" ] && export GH_TOKEN="$tok"

# 한 번에: 첫 줄 = 열린 수, 둘째 줄 = 최근 3건 제목
open_info=$(timeout 4 gh issue list -R "$REPO" --label cross-repo-notice --state open --json title,createdAt --limit 20 \
  --jq '(length | tostring), (sort_by(.createdAt) | reverse | .[:3] | map(.title) | join(" · "))' 2>/dev/null) || fail
open_count=$(printf '%s\n' "$open_info" | sed -n 1p)
titles=$(printf '%s\n' "$open_info" | sed -n 2p)
case "$open_count" in ''|*[!0-9]*) fail ;; esac
if [ "$open_count" -eq 0 ]; then
  echo "📬 미분양 통보 0건"
  exit 0
fi

stale_count=$(timeout 4 gh issue list -R "$REPO" --label stale-unread --state closed --limit 50 --json closedAt \
  --jq '[.[] | select(.closedAt != null and (.closedAt | fromdateiso8601) > (now - 14*86400))] | length' 2>/dev/null) || stale_count="?"

echo "📬 미분양 통보 ${open_count}건(안 읽음 · 14일 넘어 닫힘 ${stale_count}건): ${titles}"
exit 0
