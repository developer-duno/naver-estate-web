#!/usr/bin/env bash
# 세션 시작 때 미분양(mibunyang)이 2u 에 보낸 공유 DB 통보(열린 이슈)를 한 줄로 보여 준다 (세션 459).
# 미분양 .github/workflows/notify-sister.yml 이 미분양 레포에 `cross-repo-notice` 이슈를 연다 — 닫음 = 읽음.
# 14일 동안 안 닫힌 통보는 `stale-unread` 라벨이 붙어 자동으로 닫히므로, 최근 14일에 그렇게 닫힌 수도 같이 센다
# (열린 통보가 0건이어도 보인다 — 미분양 .claude/hooks/sister-notices.sh 와 같은 분기).
# gh 목록 조회는 한 번만 한다 — PC 가 바쁘면 gh.exe 한 번에 몇 초씩 걸려 여러 번 부르면 훅 제한 10초를 넘긴다.
# 종료코드는 항상 0(세션 시작을 막지 않는다) · 출력은 stdout 한 줄.

REPO="developer-duno/mibunyang"
fail() { echo "📬 미분양 통보 확인 못 함(gh 오류)"; exit 0; }

command -v gh >/dev/null 2>&1 || fail
# gh 활성 계정은 컴퓨터 전역 스위치라 다른 세션이 바꿔 놨을 수 있다 → 레포 주인 계정 토큰을 이 명령에만 쓴다(값은 출력하지 않음).
# 키 저장소가 멈추면 2초에 끊고 토큰 없이 진행한다(공개 레포라 읽기는 된다). -k 1 = 안 끝나면 1초 뒤 강제 종료.
tok=$(timeout -k 1 2 gh auth token --user developer-duno 2>/dev/null) && [ -n "$tok" ] && export GH_TOKEN="$tok"

# 한 번에(열린 것·닫힌 것 모두): 첫 줄 = 열린 수, 둘째 줄 = 최근 3건 `#번호 제목`,
# 셋째 줄 = stale-unread 라벨로 최근 14일에 닫힌 수
info=$(timeout -k 1 4 gh issue list -R "$REPO" --label cross-repo-notice --state all --limit 100 \
  --json number,title,state,closedAt,labels \
  --jq '([.[] | select(.state == "OPEN")] | sort_by(.number) | reverse) as $open
    | ([.[] | select(.state == "CLOSED" and .closedAt != null
        and ([.labels[].name] | index("stale-unread")) != null
        and (.closedAt | fromdateiso8601) > (now - 14*86400))] | length) as $stale
    | ($open | length | tostring), ($open[:3] | map("#\(.number) \(.title)") | join(" · ")), ($stale | tostring)' \
  2>/dev/null) || fail
open_count=$(printf '%s\n' "$info" | sed -n 1p)
titles=$(printf '%s\n' "$info" | sed -n 2p)
stale_count=$(printf '%s\n' "$info" | sed -n 3p)
case "$open_count" in ''|*[!0-9]*) fail ;; esac
case "$stale_count" in ''|*[!0-9]*) fail ;; esac

if [ "$open_count" -gt 0 ]; then
  echo "📬 미분양 통보 ${open_count}건(안 읽음 · 14일 넘어 닫힘 ${stale_count}건): ${titles}"
elif [ "$stale_count" -gt 0 ]; then
  echo "📬 미분양 통보 0건(14일 넘어 닫힘 ${stale_count}건 — 읽지 않은 채 닫힘)"
else
  echo "📬 미분양 통보 0건"
fi
exit 0
