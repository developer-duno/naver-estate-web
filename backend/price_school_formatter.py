"""Barrel re-export — 기존 import 호환 유지

서브모듈 5개:
  formatters/price_core.py       — format_price_value, format_price_data, HEAT_*_MAP
  formatters/complex_area.py     — format_complex_info, format_area_detail, _format_area_value
  formatters/analysis.py         — calc_jeonse_ratio, format_loan_analysis
  formatters/school.py           — format_school_data
  formatters/area_price_detail.py — format_area_price_detail, _format_*
"""

from formatters.analysis import calc_jeonse_ratio, format_loan_analysis  # noqa: F401
from formatters.area_price_detail import format_area_price_detail  # noqa: F401
from formatters.complex_area import (  # noqa: F401
    _format_area_value,
    format_area_detail,
    format_complex_info,
)
from formatters.price_core import (  # noqa: F401
    HEAT_FUEL_MAP,
    HEAT_METHOD_MAP,
    format_price_data,
    format_price_value,
)
from formatters.school import format_school_data  # noqa: F401
