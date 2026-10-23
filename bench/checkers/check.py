"""Deterministic answer checkers. Each returns (passed, normalized_answer)."""
import json
import math
from typing import Any


def _parse(answer: Any) -> Any:
    # Models sometimes submit JSON as a string; accept that.
    if isinstance(answer, str):
        s = answer.strip()
        if s[:1] in "[{" or s in ("true", "false", "null") or _is_number(s):
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                return answer
    return answer


def _is_number(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False


def _norm_scalar(v: Any) -> Any:
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, str):
        return v.strip()
    return v


def _norm_path(p: Any) -> str:
    s = str(p).strip().replace("\\", "/")
    marker = "fs-fixture/"
    if marker in s:
        s = s.split(marker, 1)[1]
    return s.lstrip("./").lstrip("/")


def check(kind: str, expected: Any, answer: Any) -> tuple[bool, Any]:
    a = _parse(answer)
    if kind == "number":
        try:
            x = float(a)
        except (TypeError, ValueError):
            return False, a
        return math.isclose(x, float(expected), rel_tol=0, abs_tol=0.006), x
    if kind == "string":
        return isinstance(a, (str, int, float)) and str(a).strip().casefold() == str(expected).strip().casefold(), a
    if kind == "path":
        return isinstance(a, str) and _norm_path(a) == _norm_path(expected), a
    if kind in ("list", "set"):
        if not isinstance(a, list):
            return False, a
        norm = [_norm_path(x) if isinstance(x, str) and "/" in x else _norm_scalar(x) for x in a]
        exp = [_norm_path(x) if isinstance(x, str) and "/" in x else _norm_scalar(x) for x in expected]
        if kind == "set":
            return sorted(map(json.dumps, norm)) == sorted(map(json.dumps, exp)), norm
        return norm == exp, norm
    if kind == "exact":
        def deep(v):
            if isinstance(v, dict):
                return {str(k): deep(x) for k, x in v.items()}
            if isinstance(v, list):
                return [deep(x) for x in v]
            return _norm_scalar(v)
        return deep(a) == deep(expected), a
    raise ValueError(f"unknown check kind {kind}")
