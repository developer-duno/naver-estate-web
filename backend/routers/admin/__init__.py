"""admin 패키지 — 관리자 API

sub-modules: _shared, users, jobs, data, collect, scheduler
"""

# 서브모듈 import → @router 데코레이터 등록  # noqa: I001
from routers.admin import collect as _collect_mod  # noqa: F401, I001
from routers.admin import data as _data_mod  # noqa: F401, I001
from routers.admin import jobs as _jobs_mod  # noqa: F401, I001
from routers.admin import scheduler as _sched_mod  # noqa: F401, I001
from routers.admin import users as _users_mod  # noqa: F401, I001
from routers.admin._shared import router as router  # noqa: I001
