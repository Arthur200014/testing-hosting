#!/usr/bin/env python3
"""Read-only production health/latency probe: no credentials or student data."""
from __future__ import annotations
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

PRODUCTION_ORIGIN = "https://arthur200014-testing-hosting-8c4e.twc1.net"
CHECKS = (
    ("/health/live", {200}),
    ("/health/ready", {200}),
    ("/health/migrations", {200}),
    ("/api/v1/teacher/students", {401, 403}),
)

@dataclass(frozen=True)
class Probe:
    path: str
    status: int | None
    ttfb_ms: float | None
    total_ms: float
    ok: bool

def probe(origin: str, path: str, allowed: set[int], *, timeout: float = 12) -> Probe:
    start = time.perf_counter()
    request = urllib.request.Request(origin.rstrip("/") + path, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            ttfb = (time.perf_counter() - start) * 1000
            status = response.status
            response.read(1024)
    except urllib.error.HTTPError as error:
        ttfb = (time.perf_counter() - start) * 1000
        status = error.code
        error.close()
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        total = (time.perf_counter() - start) * 1000
        print(f"{path}: transport failure ({type(error).__name__})", file=sys.stderr)
        return Probe(path, None, None, round(total, 1), False)
    total = (time.perf_counter() - start) * 1000
    return Probe(path, status, round(ttfb, 1), round(total, 1), status in allowed)

def check_all(origin: str = PRODUCTION_ORIGIN) -> list[Probe]:
    return [probe(origin, path, expected) for path, expected in CHECKS]

def main() -> int:
    results = check_all()
    lines = ["| Read-only endpoint | HTTP | TTFB (ms) | Total (ms) | Result |",
             "|---|---:|---:|---:|---|"]
    for result in results:
        label = "PASS" if result.ok else "FAIL"
        lines.append(f"| {result.path} | {result.status or '—'} | "
                     f"{result.ttfb_ms if result.ttfb_ms is not None else '—'} | "
                     f"{result.total_ms} | {label} |")
    table = "\n".join(lines)
    print(table)
    print("Public health/auth latency only; authenticated teacher API speed not measured.")
    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as output:
            output.write("### Timeweb read-only health and latency\n\n" + table + "\n\n")
            output.write("No student reads/writes, no login, import, or deploy. "
                         "Health responses cannot identify the running commit.\n")
    return 0 if all(result.ok for result in results) else 1

if __name__ == "__main__":
    raise SystemExit(main())
