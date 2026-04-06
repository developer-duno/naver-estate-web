"""admin 패키지 공유 — router, 공통 dependencies"""

import logging

from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger(__name__)
