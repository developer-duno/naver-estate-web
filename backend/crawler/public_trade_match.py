"""국토부 아파트 매매 실거래가 → 우리 단지 짝짓기 (세션 469).

주간 수집(collect_public_trade_data)과 소급 수집(backfill_price_history)이 둘 다 이것만 쓴다.

정부 응답에는 단지 번호·법정동 코드가 없다. 그래서 이름만으로 짝을 지으면 같은 시군구의
같은 이름 단지(예: 수원 권선구 금곡동·고색동의 '거산')끼리 거래가 섞였다. 이제 규칙은:

- 법정동: 응답 umdNm 의 첫 낱말("옥포읍 교항리" → "옥포읍") == 우리 주소의 마지막 낱말.
  둘 중 하나라도 비면 짝 없음.
- 유형: 아파트 매매 창구이므로 오피스텔(OPST·OBYG)은 후보가 아니다. 같은 동·같은 이름이
  여럿이면 APT < JGC < ABYG < RDV < PRE 순으로 하나만, 가장 앞 순위가 둘 이상이면 안 붙인다
  ("덜 채워지더라도 틀리지 않게").
- 이름(순서대로 첫 성공): ⓐ 정확 일치 ⓑ 우리 이름 끝 '단지'를 뗀 것과 일치 ⓒ 국토부 이름 끝
  'N단지'를 뗀 것이 우리 이름과 같고, 우리 이름엔 'N단지'가 없고, 같은 시군구에 '우리 이름+N단지'
  형제 단지가 없을 때. 한 단계에서 후보가 모호하면 다음(느슨한) 단계로 넘어가지 않는다.
- 해제(취소)된 거래(cdealType "O")와 가격을 못 읽은 거래는 뺀다.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass

from crawler.public_data_api import _normalize_apt_name
from utils import safe_int

N_DANJI_SUFFIX = re.compile(r"([0-9]+)단지$")
# 없는 유형(OPST·OBYG 등) = 대상 밖
APT_TYPE_PRIORITY: dict[str, int] = {"APT": 0, "JGC": 1, "ABYG": 2, "RDV": 3, "PRE": 4}
# 짝짓기 후보는 아니지만 옛 정부 줄은 정리하는 유형(애초에 붙으면 안 됐던 오피스텔 값)
OFFICETEL_TYPES = ("OPST", "OBYG")
CANCELLED_MARK = "O"


def _strip_n_danji(norm_name: str) -> str:
    """정규화된 단지명에서 말단 'N단지'(숫자+단지)를 뗀 이름. 없으면 그대로."""
    return N_DANJI_SUFFIX.sub("", norm_name)


def dong_word_of_address(cortar_address: str | None) -> str:
    """우리 주소의 마지막 낱말("경기도 수원시 권선구 금곡동" → "금곡동"). 없으면 ""."""
    words = (cortar_address or "").split()
    return words[-1] if words else ""


def dong_word_of_umd(umd_nm: str | None) -> str:
    """정부 응답 법정동 이름의 첫 낱말("옥포읍 교항리" → "옥포읍"). 없으면 ""."""
    words = (umd_nm or "").split()
    return words[0] if words else ""


def is_cancelled_trade(trade: dict) -> bool:
    """해제(취소)된 거래인지 — cdealType 이 "O" 면 해제."""
    return str(trade.get("cdealType") or "").strip() == CANCELLED_MARK


def trade_price(trade: dict) -> int:
    """거래 금액(만원). 쉼표를 떼고 읽으며 못 읽으면 0."""
    price_str = str(trade.get("dealAmount") or trade.get("거래금액") or "0")
    return safe_int(price_str.replace(",", "").strip()) or 0


@dataclass(frozen=True)
class ComplexRef:
    complex_no: str
    norm_name: str
    dong: str
    type_code: str | None


class SigunguMatcher:
    """한 시군구의 단지 목록으로 만든 짝짓기 색인."""

    def __init__(self, complexes: Iterable[ComplexRef]) -> None:
        self._all = list(complexes)
        self._by_dong: dict[str, list[ComplexRef]] = {}
        for c in self._all:
            if c.dong and c.norm_name and c.type_code in APT_TYPE_PRIORITY:
                self._by_dong.setdefault(c.dong, []).append(c)
        # 'X+N단지' 꼴 단지가 있는 X 들 — 유형·동 무관, 시군구 전체(옛 _has_sibling_n_danji 와 같은 범위)
        self._sibling_bases = {
            _strip_n_danji(c.norm_name) for c in self._all
            if c.norm_name and N_DANJI_SUFFIX.search(c.norm_name)
        }
        self._memo: dict[tuple[str, str], str | None] = {}

    @classmethod
    def from_db(cls, db, sigungu_cd: str) -> "SigunguMatcher":
        from db.models import Complex

        rows = (
            db.query(
                Complex.complex_no, Complex.complex_name,
                Complex.cortar_address, Complex.real_estate_type_code,
            )
            .filter(Complex.cortar_no.startswith(sigungu_cd))
            .all()
        )
        return cls(
            ComplexRef(
                complex_no=r.complex_no,
                norm_name=_normalize_apt_name(r.complex_name),
                dong=dong_word_of_address(r.cortar_address),
                type_code=r.real_estate_type_code,
            )
            for r in rows
        )

    @property
    def complex_nos(self) -> list[str]:
        """시군구의 모든 단지 번호(오피스텔 포함 — 옛 줄 정리 범위용)."""
        return [c.complex_no for c in self._all]

    @property
    def cleanup_complex_nos(self) -> list[str]:
        """옛 정부 줄을 지워도 되는 단지 — 법정동 낱말이 있고 아파트 유형이거나 오피스텔.

        법정동을 모르거나 유형이 비어 있는 단지는 애초에 짝이 될 수 없으니, "이번에 짝이 안 됐다"를
        옛 값이 틀렸다는 증거로 삼지 않는다(그 단지의 옛 줄은 그대로 둔다).
        """
        return [
            c.complex_no for c in self._all
            if c.dong and (c.type_code in APT_TYPE_PRIORITY or c.type_code in OFFICETEL_TYPES)
        ]

    @property
    def has_apt_candidates(self) -> bool:
        """짝이 될 수 있는 단지(법정동·이름·아파트 유형이 다 있는)가 하나라도 있나."""
        return bool(self._by_dong)

    def match(self, umd_nm: str | None, apt_nm: str | None) -> str | None:
        dong = dong_word_of_umd(umd_nm)
        api_norm = _normalize_apt_name(apt_nm or "")
        if not dong or not api_norm:
            return None
        key = (dong, api_norm)
        if key not in self._memo:
            self._memo[key] = self._match(dong, api_norm)
        return self._memo[key]

    def _match(self, dong: str, api_norm: str) -> str | None:
        cands = self._by_dong.get(dong, [])
        if not cands:
            return None

        exact = [c for c in cands if c.norm_name == api_norm]
        if exact:
            return self._pick(exact)

        short = [
            c for c in cands
            if (s := re.sub(r"단지$", "", c.norm_name)) != c.norm_name and s == api_norm
        ]
        if short:
            return self._pick(short)

        if N_DANJI_SUFFIX.search(api_norm):
            base = _strip_n_danji(api_norm)
            absorbed = [
                c for c in cands
                if c.norm_name == base
                and not N_DANJI_SUFFIX.search(c.norm_name)
                and c.norm_name not in self._sibling_bases
            ]
            if absorbed:
                return self._pick(absorbed)
        return None

    @staticmethod
    def _pick(found: list[ComplexRef]) -> str | None:
        if len(found) == 1:
            return found[0].complex_no
        best = min(APT_TYPE_PRIORITY[c.type_code] for c in found)
        top = [c for c in found if APT_TYPE_PRIORITY[c.type_code] == best]
        return top[0].complex_no if len(top) == 1 else None

    def aggregate(self, trades: list[dict]) -> dict[str, list[int]]:
        """거래 목록 → 단지 번호별 가격들(해제·가격 0·짝 없음 제외). 여러 국토부 이름이 한 단지로 모이면 합친다."""
        out: dict[str, list[int]] = {}
        for trade in trades:
            if is_cancelled_trade(trade):
                continue
            price = trade_price(trade)
            if not price:
                continue
            complex_no = self.match(
                trade.get("umdNm") or trade.get("법정동"),
                trade.get("aptNm") or trade.get("아파트"),
            )
            if complex_no:
                out.setdefault(complex_no, []).append(price)
        return out

    def aggregate_by_area(self, trades: list[dict]) -> dict[str, dict[int, list[int]]]:
        """거래 목록 → 단지 번호별 · 전용면적 묶음(정수 ㎡)별 가격들 (세션 474 B27).

        해제·가격 0·짝 없음 제외는 aggregate 와 같은 규칙이다. 전용면적(excluUseAr)을 못 읽는 거래는 묶음에서만
        빠진다 — aggregate 의 달 평균 줄에는 그대로 들어간다.
        """
        from crawler.area_group import area_group_of

        out: dict[str, dict[int, list[int]]] = {}
        for trade in trades:
            if is_cancelled_trade(trade):
                continue
            price = trade_price(trade)
            if not price:
                continue
            area = area_group_of(trade.get("excluUseAr") or trade.get("전용면적"))
            if area is None:
                continue
            complex_no = self.match(
                trade.get("umdNm") or trade.get("법정동"),
                trade.get("aptNm") or trade.get("아파트"),
            )
            if complex_no:
                out.setdefault(complex_no, {}).setdefault(area, []).append(price)
        return out
