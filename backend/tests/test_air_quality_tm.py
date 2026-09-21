"""에어코리아 TM 좌표 변환 회귀 가드 — 2026-09-22 실사고.

## 무엇을 막는가

`wgs84_to_tm` 이 잘못된 좌표를 주면 **에어코리아가 엉뚱한 관측소를 돌려준다.**
그런데 API 는 **에러를 안 내고 먼 관측소를 정상 응답으로 준다** — 그래서 6개월 넘게 잠복했다.

실사고: `tm_y` 에 false northing 이 통째로 빠져 한국 전역이 **음수**였다
(서울시청 tmY=-48,300). 그 좌표로 부르면 서울시청인데 제주 "남원읍"(35km)이 돌아온다.

⚠️ **피해 규모 정정(같은 날 재측정).** 처음엔 "3,068단지에 8종류만 붙었다" 고 적었으나
**그 측정이 틀렸다** — 전수 재측정은 **392종 · 3,068행 전부 채움 · 거리 중앙값 1,585m** 로
정상이었다. 오측 원인은 `infra.updated_at`(mibunyang 의 kakao 수집기가 찍는 컬럼)을
대기질 시각으로 읽은 것이다. 그러므로 **이 가드의 근거는 "현재 피해" 가 아니라
"공식이 틀렸다는 것 자체"** 다 — 옛 좌표를 쓰면 엉뚱한 관측소가 나오는 것은 아래 원점
실측표가 보여 준다.

## 왜 좌표 범위만 보면 부족한가

`y_0` 가 100,000 만 달라도(5186 vs 5181) 좌표는 여전히 "정상 범위" 안이지만
**26km 엉뚱한 관측소**가 나온다(서울시청 → 철원). 그래서 이 테스트는 **알려진 정답 좌표**를
못 박는다 — 원점을 바꾸면 바로 red.
"""

import math

from crawler.air_quality_api import (
    TM_FALSE_EASTING,
    TM_FALSE_NORTHING,
    TM_ORIGIN_LAT,
    TM_ORIGIN_LNG,
    wgs84_to_tm,
)

# 2026-09-22 라이브 실측으로 확정한 EPSG:5181 값.
# 각 지점은 `getNearbyMsrstnList` 가 **0.5km 이내 관측소**를 돌려준 것이 확인된 좌표다
#   서울시청 → "중구" 0.5km · 수원시청 → "인계동" 0.3km · 부산시청 → "연산동" 0.3km
KNOWN = [
    ("서울시청", 37.5666, 126.9784, 198092, 451896),
    ("수원시청", 37.2636, 127.0286, 202537, 418268),
    ("부산시청", 35.1796, 129.0756, 389077, 188994),
]


def test_원점_상수가_5181이다():
    """⚠️ 뮤테이션 대상 — `y_0` 를 600000(5186)으로 바꾸면 red.

    공식 문서(data.go.kr 15073877)는 원점을 명시하지 않는다. 이 값은 실측으로만 확정된다.
    """
    assert TM_ORIGIN_LAT == 38.0
    assert TM_ORIGIN_LNG == 127.0
    assert TM_FALSE_EASTING == 200000.0
    assert TM_FALSE_NORTHING == 500000.0, (
        "에어코리아는 EPSG:5181(y_0=500,000)을 쓴다. 600,000(5186)으로 바꾸면 "
        "서울시청에 철원(26km)이 나온다 — 바꾸기 전 라이브 실측 필수."
    )


def test_알려진_지점의_좌표가_정확하다():
    """정확한 TM 전개식과 1m 이내로 일치해야 한다."""
    for name, lat, lng, want_x, want_y in KNOWN:
        x, y = wgs84_to_tm(lat, lng)
        assert abs(x - want_x) < 1, f"{name} tmX={x:.0f} (기대 {want_x})"
        assert abs(y - want_y) < 1, f"{name} tmY={y:.0f} (기대 {want_y})"


def test_false_northing이_살아있다():
    """⚠️ 뮤테이션 대상 — false northing 을 지우면(=0) red.

    옛 구현의 결함이 정확히 이것이었다(서울 -48,300 · 제주 -525,896).

    ⚠️ "한국 전역이 양수" 는 **틀린 단언**이다(처음에 그렇게 썼다가 제주에서 red).
    중부원점 기준이라 남쪽으로 갈수록 Y 가 줄고, 서귀포는 **-26,482 로 음수인 것이 정상**이다.
    라이브 실측으로 확인: 서귀포시청(Y=-26,482) → "동홍동" **1km** 로 정상 응답.
    그래서 "양수" 가 아니라 **기준 위도(38N) 대비 상대 위치**가 맞는지를 본다.
    """
    # 원점(38N)에서는 Y 가 정확히 false northing 이어야 한다 — 이게 상수가 살아 있다는 증거
    _, y_at_origin = wgs84_to_tm(TM_ORIGIN_LAT, TM_ORIGIN_LNG)
    assert abs(y_at_origin - TM_FALSE_NORTHING) < 1, (
        f"원점에서 tmY={y_at_origin:.0f} (기대 {TM_FALSE_NORTHING:.0f}) — false northing 이 빠졌다"
    )
    x_at_origin, _ = wgs84_to_tm(TM_ORIGIN_LAT, TM_ORIGIN_LNG)
    assert abs(x_at_origin - TM_FALSE_EASTING) < 1

    # 남북 순서가 뒤집히지 않았는지 (제주가 가장 낮고 강원이 가장 높다)
    ys = [wgs84_to_tm(lat, 127.0)[1] for lat in (33.2, 35.2, 37.5, 38.5)]
    assert ys == sorted(ys), f"남→북 Y 가 단조증가해야 한다: {[round(v) for v in ys]}"


def test_거리가_실제_거리와_맞는다():
    """TM 평면거리 ≈ 실제 거리. 타원체를 바꾸면(Bessel 복귀) 오차가 커져 red.

    서울시청 ↔ 수원시청 실제 약 33.7km.
    """
    x1, y1 = wgs84_to_tm(37.5666, 126.9784)
    x2, y2 = wgs84_to_tm(37.2636, 127.0286)
    dist_km = math.hypot(x2 - x1, y2 - y1) / 1000
    assert 33.0 < dist_km < 34.5, f"서울↔수원 {dist_km:.1f}km (기대 약 33.7km)"


def test_동쪽으로_갈수록_x가_커진다():
    """부호·축이 뒤바뀌지 않았는지."""
    west, _ = wgs84_to_tm(37.5, 126.5)
    east, _ = wgs84_to_tm(37.5, 128.5)
    assert east > west

    _, south = wgs84_to_tm(35.0, 127.0)
    _, north = wgs84_to_tm(38.0, 127.0)
    assert north > south
