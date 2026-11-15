"""앱 아이콘 정적 그림 만들기 (세션 509 · B36 ① — 사장님이 고른 「후보 1 · 아파트 세 동 + 주황 꺾은선」)

만드는 것
- public/icon-192.png · public/icon-512.png  — manifest.ts icons 가 가리키는 홈 화면·앱 아이콘
- src/app/favicon.ico (16·32·48)              — 브라우저 탭 기본 아이콘

기하는 src/app/icon.tsx · src/app/apple-icon.tsx 의 SVG 와 같다(viewBox 0 0 32 32).
바꿀 땐 세 파일을 같이 고친다.

실행: cd frontend && python scripts/gen-app-icons.py   (Pillow 필요)
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

NAVY = (0x0B, 0x1F, 0x3A, 255)
WHITE = (0xFF, 0xFF, 0xFF, 255)
ORANGE = (0xFF, 0x9A, 0x4D, 255)

# viewBox 0 0 32 32 기준 좌표
CORNER = 7
BARS = [(6, 15, 5, 11), (13.5, 9, 5, 17), (21, 12, 5, 14)]  # (x, y, w, h)
LINE = [(5, 13), (12, 9), (18, 11), (27, 5)]
STROKE = 2.6
# 16px 판만 선을 굵게 — 2.6 단위는 1.3px 라 사라지진 않지만 중간이 옅은 조각으로 끊겨 보인다.
# 3.4(1.7px)는 선이 이어지고 막대는 그대로 보인다(세션 509 8배 확대 비교 · 진한 주황 화소 12 → 15)
STROKE_16 = 3.4

SUPER = 16  # 크게 그린 뒤 줄여 가장자리를 매끄럽게


def draw(size: int, *, rounded: bool = True, stroke: float = STROKE) -> Image.Image:
    big = size * SUPER
    k = big / 32
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=CORNER * k, fill=NAVY)
    else:
        d.rectangle((0, 0, big - 1, big - 1), fill=NAVY)
    for x, y, w, h in BARS:
        d.rectangle((x * k, y * k, (x + w) * k - 1, (y + h) * k - 1), fill=WHITE)
    pts = [(x * k, y * k) for x, y in LINE]
    width = round(stroke * k)
    d.line(pts, fill=ORANGE, width=width, joint="curve")
    r = width / 2
    for x, y in (pts[0], pts[-1]):  # 둥근 끝(stroke-linecap="round")
        d.ellipse((x - r, y - r, x + r, y + r), fill=ORANGE)
    return im.resize((size, size), Image.BOX)  # 면적 평균 — LANCZOS 는 막대 옆에 옅은 테(링잉)가 생긴다


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    for s in (192, 512):
        draw(s).save(root / "public" / f"icon-{s}.png", optimize=True)
    ico = [draw(16, stroke=STROKE_16), draw(32), draw(48)]
    ico[2].save(
        root / "src" / "app" / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=ico[:2],
    )
    print("ok: public/icon-192.png · public/icon-512.png · src/app/favicon.ico(16·32·48)")


if __name__ == "__main__":
    main()
