"""공유 DB 소유권 가드 — 미분양 정본 `supabase/ownership.json` 과 2u 백엔드 코드를 대조한다 (세션 459).

왜 있나
    같은 Supabase DB 를 두 레포(미분양 · 2u = 이 레포)가 쓴다. "어느 표·칸을 누가 쓰나"의 정본은 미분양 레포의
    `supabase/ownership.json` 하나다(미분양 설계서 docs/superpowers/specs/2026-10-09-shared-db-ownership-registry-design.md).
    미분양 쪽 가드(`scripts/audit-shared-db-ownership.mjs`)는 미분양 코드만 본다 — 이 스크립트는 2u 코드가 정본에서
    벗어나 미분양 칸·공유 표를 건드리는지를 합치기 전에 잡는다. 표준 라이브러리만 쓴다(CI 에서 의존 설치 0).

판정
    ① 등록제 — 파일 안에 미분양 소유·공유(shared) 표의 모델 이름(`\\bComplex\\b`)·표 이름 글자(`"complexes"`)·
       SQL 쓰기 대상(`UPDATE complexes SET`)이 있고, 같은 파일에 쓰기 흔적(`db.add(`·`pg_insert(`·`.update({`·
       ORM `.delete(`·SQL INSERT/UPDATE/DELETE 문)이 있으면 (파일, 표)가 `writers.2u[파일][표]` 에 있어야 한다.
       없으면 🔴. 머리 주석(첫 30줄) `# ownership-guard: allow <표> <사유>` 가 있으면 그 표의 ① 만 🟡 —
       단 그 표에 직접 쓰는 사슬(`pg_insert(모델)`·`db.query(모델)….update/delete(`·`db.add(모델(`·SQL 쓰기 문)이
       있으면 🔴 그대로.
       쓰기로 세는 꼴: `.add/.add_all/.merge/.delete/.bulk_save_objects(` 는 받는 쪽 이름(`db`·`s`·`sess`…)과 상관없이
       인자가 모델·모델 생성·풀린 행 변수면 그 표 · `X.insert/update/delete(모델)`(`sa.update(Complex)`) ·
       `from sqlalchemy… import insert as 별명` 의 별명 호출(`db_insert(모델)`) · `모델.__table__.insert/update/delete()` ·
       `setattr(풀린 행 변수, …)` · `text('UPDATE ' + …)` 처럼 이어 붙인 SQL(표 모름 쓰기 — f-string 도 같음).
    ② 칸 기준선 — 등록된 파일 안의 글자 키(`"col":`·`col=`·`.col =`·SQL 문자열 `UPDATE … SET col = :v`·
       `setattr(행, "col", …)`·`{모델.col: v}`·`dict(col = …)`)가 그 표의 미분양 칸(`columns.mibunyang`)인데
       `writers.2u[파일][표]` 기준선에 없으면 🔴. 기준선 `["*"]` 은 통과, `columns` 없는 표는 생략.
    ③ 행 삭제 — 공유 표 행을 지우는 코드(`db.query(모델)….delete(`·`db.delete(행)`·`DELETE FROM 표`)가
       `delete_allowed.2u[파일]` 밖이면 🔴(allow 주석과 무관). 캐시 `.delete(key)` 는 대상이 아니다 — 대상 표는
       구문 트리로 푼다. 행 변수의 표를 못 풀면 그 파일이 언급한 공유 표 전부를 대상으로 본다(보수적).
    ④ 마이그 — `--since` 가 있으면 그 기준 이후 바뀐/새 `backend/db/migrations/*.sql` 에서 공유·미분양 소유 표이거나
       미분양이 읽는 표(`readers`)의 `DROP COLUMN`·`RENAME COLUMN`·`DROP TABLE`·`ALTER TABLE … RENAME TO` 는 🔴,
       미분양 소유·공유 표의 칸 추가(`ADD COLUMN`·`ADD 칸 타입`)는 🟡. `--since` 가 없으면 ④ 는 생략하고 그렇다고 출력한다.
    정본 자체 — 받기 실패(재실행 안내)와 JSON 오류·version != 1·필수 키 없음·`owner` 값이나 `columns` 키가 모르는 값
       (형식 바뀜 안내)은 🔴(조용히 통과하지 않는다). writers.2u·delete_allowed.2u 에 적힌 파일이 레포에 없거나,
       모델의 `__tablename__` 이 정본 `tables` 에 없으면 🟡. 스캔한 파일이 0개면 🔴.

못 잡는 꼴(알고 둔 한계)
    - 헬퍼가 넘겨준 행에 칸만 대입하는 미등록 파일(`crawler/env_crime.py` 꼴 — 모델 이름도 쓰기 흔적도 없다).
    - 다른 파일의 헬퍼를 부르는 쪽(`upsert_complex(db, ..)`) — 쓰기는 헬퍼 파일 쪽에서만 센다.
    - 모델을 글자로 꺼내 쓰는 꼴(`m = getattr(models, "Complex")` 뒤 `m(...)`·행 대입) — 2u 운영 코드에는 0곳.
    - 표 이름을 인자로 받는 f-string·이어 붙인 SQL — "표 모름" 쓰기로만 세고, 그 파일이 언급한 표로 넓혀 본다.
    - .sql 마이그 안의 TRUNCATE·DELETE·UPDATE(④ 는 칸·표 삭제와 이름 변경, 칸 추가만 본다).
    - ② 는 `columns.mibunyang` 만 본다 — 미분양 칸 정의가 없는 표(articles·complex_price_history)는 ② 가 사실상 없다.

끄는 법
    `backend/.ownership-guard-off` 파일이 있으면 판정 없이 exit 0(정본 형식이 바뀌어 가드를 맞출 때까지 등).
    그 파일 첫 줄에 끈 날짜·사유를 적는다 — 꺼진 동안 매 실행 출력에 그 줄이 보인다.

실행
    python backend/scripts/audit_shared_db_ownership.py                      # 정본을 raw URL 로 받아 판정
    python backend/scripts/audit_shared_db_ownership.py --registry x.json   # 받아 둔 정본으로
    python backend/scripts/audit_shared_db_ownership.py --since origin/main # ④ 마이그 판정 포함
exit 0 = 통과(🟡 는 통과) / exit 1 = 🔴 있음
"""

from __future__ import annotations

import argparse
import ast
import io
import json
import re
import subprocess
import sys
import tokenize
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

REGISTRY_URL = "https://raw.githubusercontent.com/developer-duno/mibunyang/main/supabase/ownership.json"
OFF_FILE = "backend/.ownership-guard-off"
MODEL_FILES = ("backend/db/models.py", "backend/db/mb_models.py")
SELF_FILE = "backend/scripts/audit_shared_db_ownership.py"
MIGRATIONS_DIR = "backend/db/migrations/"
FORMAT_CHANGED = "정본 형식이 바뀜 — 가드를 맞추기 전까지 backend/.ownership-guard-off 파일로 끔"
FETCH_FAILED = "정본을 받지 못함 — 잠시 뒤 재실행(GitHub/raw 장애). 계속 실패하면 backend/.ownership-guard-off 로 끔"
ALLOW_HEAD_LINES = 30
WATCHED_OWNERS = ("mibunyang", "shared")
# 미분양 가드 audit-shared-db-ownership.mjs 의 OWNERS·COLUMN_BUCKETS 와 같은 값
OWNERS = ("mibunyang", "2u", "shared", "orphan")
COLUMN_BUCKETS = ("key", "mibunyang", "2u", "contested", "orphan", "clock")

# 쓰기 흔적(①) — ORM 삭제만 센다. 캐시 `.delete(key)` 는 쓰기가 아니다.
WRITE_TRACE_RE = re.compile(
    r"\b(?:db|session)\.add\(|\.add_all\(|\bpg_insert\(|\.update\(\s*\{|\.bulk_(?:insert|update|save)_\w+\("
    r"|\b(?:db|session)\.delete\(|\.delete\(\s*(?:\)|synchronize_session)"
)
_SQL_NAME = r'((?:"?\w+"?\.)?"?\w+"?)'
SQL_WRITE_RE = re.compile(
    rf"\binsert\s+into\s+{_SQL_NAME}|\bupdate\s+(?:only\s+)?{_SQL_NAME}\s+set\b|\bdelete\s+from\s+(?:only\s+)?{_SQL_NAME}",
    re.IGNORECASE,
)
SQL_DYNAMIC_RE = re.compile(r"\b(insert\s+into|update|delete\s+from)\s+\{", re.IGNORECASE)
ALLOW_RE = re.compile(r"^\s*#\s*ownership-guard:\s*allow\s+([A-Za-z_]\w*)\s+(\S.*)$")
_DB_NAMES = ("db", "session")
# 문 만들기 함수 이름 → 종류. `from sqlalchemy… import insert as 별명` 의 별명은 파일마다 더한다.
_STMT_FUNCS = {
    "pg_insert": "insert", "insert": "insert", "update": "update", "delete": "delete",
    "sa_insert": "insert", "sa_update": "update", "sa_delete": "delete",
}
_SQL_KEYWORD_RE = re.compile(r"\b(insert\s+into|update|delete\s+from)\b", re.IGNORECASE)


class RegistryError(Exception):
    pass


class RegistryFetchError(RegistryError):
    """정본을 받지(읽지) 못함 — 형식 변경이 아니라 장애라 재실행을 안내한다."""


@dataclass
class Finding:
    level: str  # "red" | "yellow"
    rule: str  # ① ② ③ ④ 정본
    file: str
    line: int
    table: str
    reason: str


# ── 정본 ────────────────────────────────────────────────────────────


def load_registry(path: str | None) -> dict:
    """정본을 읽어 형식을 확인한다. 실패하면 RegistryError(조용히 통과 금지)."""
    try:
        if path:
            raw = Path(path).read_text(encoding="utf-8")
        else:
            with urllib.request.urlopen(REGISTRY_URL, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
    except (OSError, ValueError) as e:
        raise RegistryFetchError(str(e)) from e
    try:
        reg = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RegistryError(f"정본 JSON 오류({e})") from e
    if not isinstance(reg, dict) or reg.get("version") != 1:
        got = reg.get("version") if isinstance(reg, dict) else type(reg).__name__
        raise RegistryError(f"version 이 1 이 아님({got})")
    if not isinstance(reg.get("tables"), dict) or not isinstance((reg.get("writers") or {}).get("2u"), dict):
        raise RegistryError("tables 또는 writers.2u 가 없음")
    for t, info in reg["tables"].items():
        owner = info.get("owner") if isinstance(info, dict) else None
        if owner not in OWNERS:
            raise RegistryError(f'tables["{t}"].owner 가 모르는 값({owner!r})')
        cols = info.get("columns")
        if cols is not None and (not isinstance(cols, dict) or not set(cols) <= set(COLUMN_BUCKETS)):
            odd = sorted(set(cols) - set(COLUMN_BUCKETS)) if isinstance(cols, dict) else type(cols).__name__
            raise RegistryError(f'tables["{t}"].columns 에 모르는 키({odd})')
    return reg


# ── 코드 읽기 ──────────────────────────────────────────────────────


def model_defs(root: Path) -> list[tuple[str, int, str, str]]:
    """(모델 파일, 줄, 클래스 이름, 표 이름) — `__tablename__`, models.py·mb_models.py 둘 다."""
    out: list[tuple[str, int, str, str]] = []
    for rel in MODEL_FILES:
        p = root / rel
        if not p.exists():
            continue
        for node in ast.parse(p.read_text(encoding="utf-8")).body:
            if not isinstance(node, ast.ClassDef):
                continue
            for st in node.body:
                if (
                    isinstance(st, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == "__tablename__" for t in st.targets)
                    and isinstance(st.value, ast.Constant)
                    and isinstance(st.value.value, str)
                ):
                    out.append((rel, st.lineno, node.name, st.value.value))
    return out


def list_targets(root: Path) -> list[str]:
    """backend/**/*.py — 시험·캐시·모델 정의·이 스크립트 제외. 레포 루트 기준 슬래시 경로."""
    excluded = {*MODEL_FILES, SELF_FILE}
    out = []
    for p in (root / "backend").rglob("*.py"):
        rel = p.relative_to(root).as_posix()
        if rel in excluded or rel.startswith("backend/tests/") or "__pycache__" in p.parts:
            continue
        out.append(rel)
    return sorted(out)


def mask_text(text: str) -> str:
    """주석과 문자열 하나뿐인 문(docstring)을 공백으로 지운다 — 줄·칸 위치는 그대로 둔다."""
    try:
        toks = list(tokenize.generate_tokens(io.StringIO(text).readline))
    except (tokenize.TokenError, SyntaxError):
        return text
    spans = []
    prev = tokenize.NEWLINE
    for i, tok in enumerate(toks):
        if tok.type == tokenize.COMMENT:
            spans.append((tok.start, tok.end))
        elif tok.type == tokenize.STRING and prev in (tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING):
            j = i + 1
            while j < len(toks) and toks[j].type in (tokenize.COMMENT, tokenize.NL):
                j += 1
            if j >= len(toks) or toks[j].type in (tokenize.NEWLINE, tokenize.ENDMARKER):
                spans.append((tok.start, tok.end))
        if tok.type not in (tokenize.COMMENT, tokenize.NL):
            prev = tok.type
    starts = [0]
    for ln in io.StringIO(text).readlines():
        starts.append(starts[-1] + len(ln))
    buf = list(text)
    for (sr, sc), (er, ec) in spans:
        for k in range(starts[sr - 1] + sc, starts[er - 1] + ec):
            if buf[k] != "\n":
                buf[k] = " "
    return "".join(buf)


def _line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def _sql_table(raw: str) -> str:
    return raw.replace('"', "").split(".")[-1].lower()


def parse_allow(raw_text: str) -> dict[str, str]:
    allow: dict[str, str] = {}
    for line in raw_text.split("\n")[:ALLOW_HEAD_LINES]:
        m = ALLOW_RE.match(line)
        if m:
            allow[m.group(1)] = m.group(2).strip()
    return allow


def _scope_nodes(scope: ast.AST):
    """그 범위(모듈·함수) 안의 노드 — 안쪽 함수 몸통은 그 함수의 범위로 따로 본다."""
    stack = list(ast.iter_child_nodes(scope))
    while stack:
        node = stack.pop()
        yield node
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            stack.extend(ast.iter_child_nodes(node))


class _AstWrites:
    """구문 트리로 '어느 표에 쓰나'를 푼다 — ① 쓰기 대상 · allow 강등 차단 · ③ 삭제 대상에 쓴다.

    풀린 쓰기(표를 안다)와 못 푼 쓰기(`db.add(변수)`·`pg_insert(변수)`·`….filter().update({` 등 표를 모름)를 나눈다.
    변수 → 표는 함수 범위마다 따로 푼다(`row` 같은 이름이 함수마다 다른 표를 가리키므로).
    """

    def __init__(self, tree: ast.Module, models: dict[str, str]):
        self.alias = dict(models)
        self.stmt_funcs = dict(_STMT_FUNCS)
        self.insert_funcs = {"pg_insert"}  # 인자를 못 풀면 '표 모름' 쓰기로 세는 insert 함수
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                from_sa = (node.module or "").startswith("sqlalchemy")
                for a in node.names:
                    if a.name in models and a.asname:
                        self.alias[a.asname] = models[a.name]
                    if from_sa and a.name in ("insert", "update", "delete"):  # insert as db_insert 등
                        self.stmt_funcs[a.asname or a.name] = a.name
                        if a.name == "insert":
                            self.insert_funcs.add(a.asname or a.name)
        self.writes: dict[str, int] = {}  # 표 → 첫 줄 (삭제 포함 풀린 쓰기 전부)
        self.deletes: dict[str, int] = {}  # 표 → 첫 줄
        self.unresolved_write_line: int | None = None
        self.unresolved_delete_line: int | None = None
        scopes = [tree] + [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        for scope in scopes:
            nodes = list(_scope_nodes(scope))
            self.var_tables = self._var_tables(nodes)
            for node in nodes:
                if isinstance(node, ast.Call):
                    self._visit_call(node)
                elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
                    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                    for tgt in targets:  # 행.칸 = 값 (ORM 변경)
                        if isinstance(tgt, ast.Attribute) and isinstance(tgt.value, ast.Name):
                            for t in self.var_tables.get(tgt.value.id, ()):
                                self._add(self.writes, t, node.lineno)

    def _model_of(self, node: ast.AST | None) -> str | None:
        if isinstance(node, ast.Name):
            return self.alias.get(node.id)
        if isinstance(node, ast.Attribute):
            return self.alias.get(node.attr) or self._model_of(node.value)
        return None

    def _model_ref(self, node: ast.AST | None) -> str | None:
        """식 자체가 모델인가 — `Complex`·`models.Complex`·`Complex.__table__` 만(칸 `Complex.x` 는 아님)."""
        if isinstance(node, ast.Name):
            return self.alias.get(node.id)
        if isinstance(node, ast.Attribute):
            return self.alias.get(node.attr) or (self._model_ref(node.value) if node.attr == "__table__" else None)
        return None

    def _row_tables(self, node: ast.AST | None) -> set[str]:
        """받는 쪽 이름을 모르는 `.add/.merge/.delete(인자)` 의 인자 — 모델·모델 생성·풀린 행 변수·그 목록만 본다.

        `ids.add(c.complex_no)` 같은 칸 값은 행이 아니므로 속성 사슬은 거슬러 가지 않는다.
        """
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            return set().union(*(self._row_tables(e) for e in node.elts))
        if isinstance(node, ast.Starred):
            return self._row_tables(node.value)
        if isinstance(node, ast.Call):
            t = self._model_ref(node.func)
            return {t} if t else set()
        t = self._model_ref(node)
        if t:
            return {t}
        if isinstance(node, ast.Name):
            return set(self.var_tables.get(node.id, ()))
        return set()

    def _expr_tables(self, node: ast.AST | None) -> set[str]:
        """식의 머리가 가리키는 표 — `.query(모델…)`·`.get(모델, …)`·`모델(…)` 생성·이미 푼 변수.

        메서드 사슬·첨자·컴프리헨션 원소만 거슬러 간다. 인자 안의 변수(`Infra(apartment_id=apt.id)` 의 apt)는
        그 행의 표가 아니므로 보지 않는다.
        """
        while node is not None:
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Attribute) and func.attr in ("query", "get") and node.args:
                    t = self._model_of(node.args[0])
                    if t:
                        return {t}
                if isinstance(func, ast.Name) and func.id in self.alias:
                    return {self.alias[func.id]}
                node = func
            elif isinstance(node, (ast.Attribute, ast.Subscript, ast.Await, ast.Starred)):
                node = node.value
            elif isinstance(node, (ast.ListComp, ast.SetComp, ast.GeneratorExp)):
                node = node.elt
            elif isinstance(node, ast.Name):
                return set(self.var_tables.get(node.id, ()))
            else:
                return set()
        return set()

    def _var_tables(self, nodes: list[ast.AST]) -> dict[str, set[str]]:
        self.var_tables = {}
        for _ in range(3):  # 변수 → 변수 사슬(stale → row)을 몇 번 따라간다
            for node in nodes:
                pairs: list[tuple[ast.AST, ast.AST]] = []
                if isinstance(node, ast.Assign):
                    pairs = [(t, node.value) for t in node.targets]
                elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)) and node.value is not None:
                    pairs = [(node.target, node.value)]
                elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
                    pairs = [(node.target, node.iter)]
                for target, value in pairs:
                    if isinstance(target, ast.Name):
                        tables = self._expr_tables(value)
                        if tables:
                            self.var_tables.setdefault(target.id, set()).update(tables)
        return self.var_tables

    @staticmethod
    def _is_db(node: ast.AST) -> bool:
        if isinstance(node, ast.Name):
            return node.id in _DB_NAMES
        return isinstance(node, ast.Attribute) and node.attr in _DB_NAMES

    def _receiver(self, node: ast.AST) -> tuple[set[str], bool]:
        """`.update/.delete` 앞 사슬을 거슬러 표를 찾는다. (표들, 메서드 사슬(호출)이 있었나)"""
        cur, chained = node, False
        while True:
            if isinstance(cur, ast.Call):
                chained = True
                if isinstance(cur.func, ast.Attribute) and cur.func.attr == "query":
                    t = self._model_of(cur.args[0]) if cur.args else None
                    return ({t} if t else set()), True
                cur = cur.func
            elif isinstance(cur, ast.Attribute):
                cur = cur.value
            elif isinstance(cur, ast.Name):
                return set(self.var_tables.get(cur.id, ())), chained
            else:
                return set(), chained

    def _add(self, bucket: dict[str, int], table: str, line: int) -> None:
        bucket.setdefault(table, line)
        self.writes.setdefault(table, line)

    def _unresolved(self, line: int, delete: bool = False) -> None:
        self.unresolved_write_line = self.unresolved_write_line or line
        if delete:
            self.unresolved_delete_line = self.unresolved_delete_line or line

    def _visit_call(self, node: ast.Call) -> None:
        func, line = node.func, node.lineno
        first = node.args[0] if node.args else None
        if isinstance(func, ast.Name):
            kind = self.stmt_funcs.get(func.id)
            if kind:  # pg_insert(모델) · sqlalchemy insert/update/delete(모델) · 그 별명(db_insert)
                t = self._model_of(first)
                if t:
                    self._add(self.deletes if kind == "delete" else self.writes, t, line)
                elif func.id in self.insert_funcs:
                    self._unresolved(line)
            elif func.id == "setattr" and isinstance(first, ast.Name):  # setattr(행, "칸", 값)
                for t in self.var_tables.get(first.id, ()):
                    self._add(self.writes, t, line)
            elif func.id == "text":
                self._visit_text(node)
            return
        if not isinstance(func, ast.Attribute):
            return
        attr = func.attr
        if attr == "text":
            self._visit_text(node)
            return
        if attr in ("insert", "update", "delete"):
            # 모델.__table__.insert/update/delete() · sa.update(모델) — 받는 쪽 이름과 상관없이 첫 인자가 모델
            base = func.value
            t = self._model_ref(base.value) if isinstance(base, ast.Attribute) and base.attr == "__table__" else None
            t = t or self._model_ref(first)
            if t:
                self._add(self.deletes if attr == "delete" else self.writes, t, line)
                return
        if attr == "delete" and self._is_db(func.value):  # db.delete(행)
            tables = self._expr_tables(first) if first is not None else set()
            if not tables:
                self._unresolved(line, delete=True)
            for t in tables:
                self._add(self.deletes, t, line)
        elif attr in ("update", "delete"):
            tables, chained = self._receiver(func.value)
            if not tables and attr == "delete":  # s.delete(행) — 받는 쪽 이름이 db 가 아니어도
                tables = self._row_tables(first)
            for t in tables:
                self._add(self.deletes if attr == "delete" else self.writes, t, line)
            if tables:
                return
            orm_kw = any(k.arg == "synchronize_session" for k in node.keywords)
            if attr == "delete" and ((not node.args and not node.keywords) or orm_kw):
                self._unresolved(line, delete=True)  # 표를 모르는 ORM 일괄 삭제
            elif attr == "update" and (orm_kw or (chained and isinstance(first, ast.Dict))):
                self._unresolved(line)  # 표를 모르는 ORM 일괄 수정(dict.update 는 사슬이 없어 제외)
        elif attr in ("add", "add_all", "merge") and (self._is_db(func.value) or attr == "add_all"):
            tables = self._expr_tables(first) if first is not None else set()
            if not tables:
                self._unresolved(line)
            for t in tables:
                self._add(self.writes, t, line)
        elif attr in ("add", "merge"):  # sess.add(모델(…)) · s.merge(행) — 받는 쪽 이름 무관, 인자가 풀릴 때만
            for t in self._row_tables(first):
                self._add(self.writes, t, line)
        elif attr.startswith("bulk_") and attr.endswith(("_mappings", "_objects")):
            t = self._model_of(first)
            tables = {t} if t else self._row_tables(first)
            for t in tables:
                self._add(self.writes, t, line)
            if not tables:
                self._unresolved(line)

    def _visit_text(self, node: ast.Call) -> None:
        """`text('UPDATE ' + 표 + …)` — 이어 붙인 SQL 은 표를 모르는 쓰기로 센다(f-string 은 SQL_DYNAMIC_RE 가 본다)."""
        first = node.args[0] if node.args else None
        if not isinstance(first, ast.BinOp):
            return
        joined = " ".join(n.value for n in ast.walk(first) if isinstance(n, ast.Constant) and isinstance(n.value, str))
        m = _SQL_KEYWORD_RE.search(joined)
        if m:
            self._unresolved(node.lineno, delete=m.group(1).lower().startswith("delete"))


# ── 판정 ────────────────────────────────────────────────────────────


_SQL_SET_RE = re.compile(r"\bset\b", re.IGNORECASE)
_SQL_SET_END_RE = re.compile(r"\b(?:where|returning|from)\b|;", re.IGNORECASE)
_SQL_ASSIGN_RE = re.compile(r"(?<![\w.:])\"?([a-z_][a-z0-9_]*)\"?\s*=(?![=>])", re.IGNORECASE)


def extract_keys(masked: str, tree: ast.AST | None = None, model_names: frozenset[str] = frozenset()) -> dict[str, int]:
    """글자 키 → 첫 줄. `"col":`·`'col':` / `col=`(키워드 인자) / `.col =`(속성 대입). `==` 는 제외.

    구문 트리가 있으면 더 본다: SQL 문자열 `UPDATE … SET col = :v`(공백 허용) · `setattr(행, "col", …)` ·
    `{모델.col: v}` 사전 키 · `dict(col = …)`(띄어 쓴 키워드 인자).
    """
    keys: dict[str, int] = {}

    def put(k: str, ln: int) -> None:
        keys[k] = min(keys.get(k, ln), ln)

    for rx in (
        re.compile(r"[\"']([a-z_][a-z0-9_]*)[\"']\s*:"),
        re.compile(r"\b([a-z_][a-z0-9_]*)=(?!=)"),
        re.compile(r"\.([a-z_][a-z0-9_]*)\s*=(?!=)"),
    ):
        for m in rx.finditer(masked):
            put(m.group(1), _line_of(masked, m.start()))
    if tree is None:
        return keys
    docstrings = {id(n.value) for n in ast.walk(tree) if isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant)}
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
            s = node.value
            if not re.search(r"\bupdate\b", s, re.IGNORECASE):
                continue
            for sm in _SQL_SET_RE.finditer(s):
                end = _SQL_SET_END_RE.search(s, sm.end())
                for am in _SQL_ASSIGN_RE.finditer(s, sm.end(), end.start() if end else len(s)):
                    put(am.group(1).lower(), node.lineno + s.count("\n", 0, am.start()))
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id == "setattr" and len(node.args) >= 2:
                col = node.args[1]
                if isinstance(col, ast.Constant) and isinstance(col.value, str):
                    put(col.value, node.lineno)
            elif node.func.id == "dict":
                for kw in node.keywords:
                    if kw.arg:
                        put(kw.arg, kw.value.lineno)
        elif isinstance(node, ast.Dict):
            for k in node.keys:
                if isinstance(k, ast.Attribute) and isinstance(k.value, ast.Name) and k.value.id in model_names:
                    put(k.attr, k.lineno)
    return keys


def audit_file(rel: str, raw: str, registry: dict, models: dict[str, str]) -> list[Finding]:
    tables: dict = registry["tables"]
    mine: dict = registry["writers"]["2u"]
    delete_allowed: dict = (registry.get("delete_allowed") or {}).get("2u") or {}
    masked = mask_text(raw)
    allow = parse_allow(raw)
    findings: list[Finding] = []

    # 표 언급 — 모델 이름 · 따옴표 안 표 이름 · SQL 쓰기 대상
    #   모델 이름 앞뒤 `-` 도 경계로 본다("Strict-Transport-Security" 의 Transport 는 모델이 아니다)
    by_table_models: dict[str, list[str]] = {}
    for cls, t in models.items():
        by_table_models.setdefault(t, []).append(cls)
    mentions: dict[str, int] = {}
    for t in tables:
        pats = [rf"(?<![\w-]){re.escape(c)}(?![\w-])" for c in by_table_models.get(t, [])] + [rf"([\"']){re.escape(t)}\1"]
        for p in pats:
            m = re.search(p, masked)
            if m:
                ln = _line_of(masked, m.start())
                mentions[t] = min(mentions.get(t, ln), ln)
    sql_writes: dict[str, int] = {}
    sql_deletes: dict[str, int] = {}
    for m in SQL_WRITE_RE.finditer(masked):
        t = _sql_table(m.group(1) or m.group(2) or m.group(3))
        ln = _line_of(masked, m.start())
        sql_writes.setdefault(t, ln)
        if m.group(3):
            sql_deletes.setdefault(t, ln)
        if t in tables:
            mentions[t] = min(mentions.get(t, ln), ln)

    trace = WRITE_TRACE_RE.search(masked)
    trace_line = _line_of(masked, trace.start()) if trace else None

    tree: ast.Module | None = None
    model_names: frozenset[str] = frozenset()
    try:
        tree = ast.parse(raw)
        aw = _AstWrites(tree, models)
        model_names = frozenset(aw.alias)
        direct = dict(aw.writes)
        deletes = dict(aw.deletes)
        unresolved_write = aw.unresolved_write_line
        unresolved_delete = aw.unresolved_delete_line
    except SyntaxError as e:
        findings.append(Finding("yellow", "정본", rel, e.lineno or 1, "-", "구문 분석 실패 — 쓰기 흔적이 있으면 언급한 표 전부에 쓴다고 본다"))
        tree = None
        direct, deletes = {}, {}
        unresolved_write = trace_line
        unresolved_delete = trace_line if trace and ".delete(" in trace.group(0) else None
    for m in SQL_DYNAMIC_RE.finditer(masked):  # f"UPDATE {표} SET …" — 표를 모르는 SQL 쓰기
        ln = _line_of(masked, m.start())
        unresolved_write = min(unresolved_write or ln, ln)
        if m.group(1).lower().startswith("delete"):
            unresolved_delete = min(unresolved_delete or ln, ln)
    for t, ln in sql_writes.items():
        direct.setdefault(t, ln)
    for t, ln in sql_deletes.items():
        deletes.setdefault(t, ln)

    # ① 등록제 — 그 표에 쓰는 코드가 풀렸거나, 표를 모르는 쓰기가 파일에 있으면 (파일, 표) 등록 필요.
    #   쓰기가 전부 다른 표로 풀리면(예: Complex 를 읽고 CrawlJob 만 db.add) 언급은 읽기다.
    for t, ln in sorted(mentions.items()):
        if tables[t].get("owner") not in WATCHED_OWNERS or t in (mine.get(rel) or {}):
            continue
        if t not in direct and unresolved_write is None:
            continue
        where = direct.get(t) or unresolved_write or ln
        reason = (
            f'미등록 쓰기 — 표 "{t}"({tables[t]["owner"]}) 언급 + 쓰기 흔적 · '
            f'정본 writers.2u["{rel}"]["{t}"] 에 칸까지 등록하거나, 읽기만이면 머리 주석 allow'
        )
        if t in allow and t not in direct:
            findings.append(Finding("yellow", "①", rel, where, t, f"{reason} → allow({allow[t]})로 🟡"))
        else:
            findings.append(Finding("red", "①", rel, where, t, reason))

    # ② 칸 기준선
    keys = None
    for t, cols in (mine.get(rel) or {}).items():
        theirs = ((tables.get(t) or {}).get("columns") or {}).get("mibunyang") or []
        if not theirs or cols == ["*"]:
            continue
        keys = keys if keys is not None else extract_keys(masked, tree, model_names)
        for k in theirs:
            if k in keys and k not in cols:
                findings.append(Finding("red", "②", rel, keys[k], t, f"미분양 칸 쓰기 — {t}.{k} 가 이 파일 기준선 밖(미분양 소유 칸)"))

    # ③ 공유 표 행 삭제
    targets = dict(deletes)
    if unresolved_delete is not None:  # 행 변수의 표를 못 풀었다 → 언급한 공유 표 전부
        for t in mentions:
            targets.setdefault(t, unresolved_delete)
    for t, ln in sorted(targets.items()):
        if (tables.get(t) or {}).get("owner") == "shared" and t not in (delete_allowed.get(rel) or []):
            findings.append(Finding("red", "③", rel, ln, t, f"공유 표 행 삭제 — delete_allowed.2u[\"{rel}\"] 에 {t} 없음(미분양 칸까지 함께 지워진다)"))
    return findings


_SQL_DESTRUCTIVE = (
    re.compile(r"\bdrop\s+column\b", re.I),
    re.compile(r"\brename\s+column\b", re.I),
    re.compile(r"\brename\s+to\b", re.I),
    re.compile(r"\brename\s+(?!to\b|column\b|constraint\b)\"?\w+\"?\s+to\b", re.I),
)
# 칸 추가 — `ADD COLUMN x` 와 COLUMN 을 생략한 `ADD x int` 둘 다. 제약·키 추가는 칸이 아니다.
_SQL_ADD_COLUMN = re.compile(r"\badd\s+(?!constraint\b|primary\b|unique\b|foreign\b|check\b|exclude\b)\"?\w", re.I)


def check_migration_sql(rel: str, sql: str, registry: dict) -> list[Finding]:
    """④ 마이그 한 파일 판정. 공유·미분양 소유·미분양이 읽는 표의 파괴적 변경 = 🔴, 미분양 표 ADD COLUMN = 🟡."""
    tables: dict = registry["tables"]

    def protected(t: str) -> bool:
        info = tables.get(t) or {}
        return info.get("owner") in WATCHED_OWNERS or "mibunyang" in (info.get("readers") or [])

    # 주석을 공백으로(줄 번호 유지)
    body = re.sub(r"/\*[\s\S]*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), sql)
    body = re.sub(r"--[^\n]*", lambda m: " " * len(m.group(0)), body)
    findings: list[Finding] = []
    pos = 0
    for raw in body.split(";"):
        line = _line_of(body, pos + len(raw) - len(raw.lstrip()))
        pos += len(raw) + 1
        stmt = re.sub(r"\s+", " ", raw).strip()
        if not stmt:
            continue
        alter = re.search(r"\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?" + _SQL_NAME, stmt, re.I)
        if alter:
            t = _sql_table(alter.group(1))
            if protected(t) and any(rx.search(stmt) for rx in _SQL_DESTRUCTIVE):
                findings.append(Finding("red", "④", rel, line, t, f"미분양이 쓰거나 읽는 표의 칸 삭제·이름 변경 — {stmt[:120]}"))
            owner = (tables.get(t) or {}).get("owner")
            if _SQL_ADD_COLUMN.search(stmt) and owner in WATCHED_OWNERS:
                what = "미분양 소유 표" if owner == "mibunyang" else "공유 표"
                findings.append(Finding("yellow", "④", rel, line, t, f"{what}에 칸 추가 — 미분양에 알릴 것"))
        drop = re.search(r"\bdrop\s+table\s+(?:if\s+exists\s+)?(.+?)(?:\s+(?:cascade|restrict))?$", stmt, re.I)
        if drop:
            for part in drop.group(1).split(","):
                t = _sql_table(part.strip())
                if protected(t):
                    findings.append(Finding("red", "④", rel, line, t, "미분양이 쓰거나 읽는 표 삭제"))
    return findings


def changed_migrations(root: Path, since: str) -> list[str]:
    """`<since>...HEAD` 사이 바뀐/새 마이그 .sql (레포 루트 기준 경로). git 실패는 RuntimeError."""
    proc = subprocess.run(
        ["git", "-C", str(root), "diff", "--name-only", "--diff-filter=ACMR", f"{since}...HEAD", "--", MIGRATIONS_DIR],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr.strip().splitlines() or ["git diff 실패"])[0])
    return sorted(f.strip() for f in proc.stdout.splitlines() if f.strip().endswith(".sql"))


def audit(root: Path, registry: dict, since: str | None) -> tuple[list[Finding], int, str]:
    """판정 본체. (판정 목록, 스캔 파일 수, ④ 상태 문구)"""
    defs = model_defs(root)
    models = {cls: table for _, _, cls, table in defs}
    findings: list[Finding] = []
    seen_tables: set[str] = set()
    for rel, line, _, table in defs:
        if table not in registry["tables"] and table not in seen_tables:
            seen_tables.add(table)
            findings.append(Finding("yellow", "정본", rel, line, table, "정본에 없는 표 — 미분양 정본 tables 에 등록할 것"))
    for section, entries in (("writers.2u", registry["writers"]["2u"]), ("delete_allowed.2u", (registry.get("delete_allowed") or {}).get("2u") or {})):
        for file in entries:
            if not (root / file).exists():
                findings.append(Finding("yellow", "정본", file, 0, "-", f"{section} 에 등록됐으나 파일 없음"))
    files = list_targets(root)
    if not files:
        findings.append(Finding("red", "정본", "backend/", 0, "-", "스캔한 파일이 0개 — --repo-root 가 레포 루트인지 확인"))
    for rel in files:
        findings += audit_file(rel, (root / rel).read_text(encoding="utf-8"), registry, models)

    if since is None:
        mig_status = "④ 마이그 생략(--since 없음)"
    else:
        try:
            migs = changed_migrations(root, since)
        except RuntimeError as e:
            findings.append(Finding("red", "④", MIGRATIONS_DIR, 0, "-", f"바뀐 마이그 목록을 못 구함({e}) — CI 면 checkout fetch-depth 0 확인"))
            migs = []
        for mig in migs:
            p = root / mig
            if p.exists():
                findings += check_migration_sql(mig, p.read_text(encoding="utf-8"), registry)
        mig_status = f"④ 마이그 {len(migs)}개 검사(기준 {since})" + (": " + ", ".join(migs) if migs else "")
    return findings, len(files), mig_status


# ── 실행 ────────────────────────────────────────────────────────────


def _print_report(findings: list[Finding], summary: str, mig_status: str) -> None:
    rows = sorted(findings, key=lambda f: (f.level != "red", f.file, f.line))
    if rows:
        print("| 판정 | 위치 | 표 | 사유 |")
        print("|---|---|---|---|")
        for f in rows:
            icon = "🔴" if f.level == "red" else "🟡"
            print(f"| {icon} {f.rule} | {f.file}:{f.line} | {f.table} | {f.reason} |")
    print(mig_status)
    print(summary)


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔(cp949)에서 이모지로 죽지 않게
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="공유 DB 소유권 가드 (미분양 정본 ownership.json 대조)")
    ap.add_argument("--registry", help="정본 파일 경로(없으면 raw URL 로 받는다)")
    ap.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[2]), help="레포 루트(기본 = 이 스크립트 기준)")
    ap.add_argument("--since", help="④ 마이그 diff 기준 git ref(없으면 ④ 생략)")
    ap.add_argument("--json", action="store_true", help="결과를 JSON 으로 출력")
    args = ap.parse_args(argv)
    root = Path(args.repo_root).resolve()

    off = root / OFF_FILE
    if off.exists():
        lines = off.read_text(encoding="utf-8", errors="replace").splitlines()
        print(f"가드 꺼짐({OFF_FILE})")
        print("⚠ 가드 꺼짐 — 끈 날짜·사유는 그 파일 첫 줄")
        print(lines[0] if lines and lines[0].strip() else "(첫 줄 비어 있음 — 끈 날짜·사유를 적을 것)")
        return 0
    try:
        registry = load_registry(args.registry)
    except RegistryFetchError as e:
        print(f"🔴 {FETCH_FAILED} ({e})")
        return 1
    except RegistryError as e:
        print(f"🔴 {e} — {FORMAT_CHANGED}")
        return 1

    findings, scanned, mig_status = audit(root, registry, args.since)
    red = sum(f.level == "red" for f in findings)
    yellow = len(findings) - red
    summary = f"🔴 {red} · 🟡 {yellow} · 스캔 {scanned}파일 · 정본 version {registry['version']}/{registry.get('updated', '?')}"
    if args.json:
        print(json.dumps({"summary": summary, "migrations": mig_status, "findings": [asdict(f) for f in findings]}, ensure_ascii=False, indent=2))
    else:
        _print_report(findings, summary, mig_status)
    return 1 if red else 0


if __name__ == "__main__":
    sys.exit(main())
