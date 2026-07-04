#!/usr/bin/env python3
"""
D8AD-CAN-008 regression test.

Verifies that shell-injection payloads in HTTP response bodies cannot cause
command execution when processed by the same patterns used in scripts/smoke.sh.

Starts an ephemeral HTTP server on 127.0.0.1 that returns responses containing:
  - $() command substitutions
  - backtick command substitutions
  - semicolons
  - single and double quotes
  - newlines and carriage returns
  - pipe, &&, || shell metacharacters

Each payload path is fetched with grep <<<, piped-to-python3, and []
conditionals — exactly the safe patterns smoke.sh now uses. After every fetch,
the test asserts no marker file was created (which would indicate the injection
payload was evaluated as shell syntax).
"""

import http.server
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time


# ── Malicious payloads ──────────────────────────────────────────────────────
# Each payload contains shell metacharacters that would be evaluated if
# the response body were interpolated into bash -c or eval.

PAYLOADS = [
    ("/command-substitution",
     'Organizational Performance $(touch /tmp/eskpi-d8ad-marker) `touch /tmp/eskpi-d8ad-marker`'),
    ("/semicolons",
     'Category Overview ; ;;; touch /tmp/eskpi-d8ad-marker ;'),
    ("/quotes",
     "Sample data '$(touch /tmp/eskpi-d8ad-marker)' "
     '`touch /tmp/eskpi-d8ad-marker` '
     '"$(touch /tmp/eskpi-d8ad-marker)"'),
    ("/newlines",
     "No data\ntouch /tmp/eskpi-d8ad-marker\nrm -f /tmp/eskpi-d8ad-marker\n"),
    ("/backticks-and-dollar",
     'Y-axis mode `$(touch /tmp/eskpi-d8ad-marker)` $(touch /tmp/eskpi-d8ad-marker)'),
    ("/shell-metachar",
     'Edit history $(cat /etc/passwd 2>&1 || echo pwned) '
     '&& rm -f /tmp/eskpi-d8ad-marker || echo pwned '
     '| sort | uniq '
     '; touch /tmp/eskpi-d8ad-marker ;'),
    ("/carriage-return",
     "Sample data\rtouch /tmp/eskpi-d8ad-marker\r"),
    ("/combined",
     'Organizational Performance $(touch /tmp/eskpi-d8ad-marker)\n'
     '# comment ; `touch /tmp/eskpi-d8ad-marker`\n'
     '&& echo "pwned"; echo \'pwned\'\n'),
]

MARKER = "/tmp/eskpi-d8ad-marker"
PASS = 0
FAIL = 0


class MaliciousHandler(http.server.BaseHTTPRequestHandler):
    """Serves responses containing shell-injection payloads."""

    def do_GET(self):
        body = dict(PAYLOADS).get(self.path, "OK")
        body = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # quieter


def find_free_port():
    """Return a free TCP port on 127.0.0.1."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def check(name, ok):
    global PASS, FAIL
    status = "PASS" if ok else "FAIL"
    print(f"  \033[32m{status}\033[0m  {name}" if ok else f"  \033[31m{status}\033[0m  {name}")
    if ok:
        PASS += 1
    else:
        FAIL += 1


def safe_patterns_bash(base_url: str) -> str:
    """
    Generate a bash script that tests all safe data-flow patterns
    (grep <<<, piped to python3, [] conditionals) against malicious payloads.

    The script uses numbered variable names to avoid any dynamic naming.
    The payloads are fetched into variables, then tested with here-strings
    — never passed through bash -c or eval.
    """
    lines = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        f'BASE="{base_url}"',
        'MARKER="/tmp/eskpi-d8ad-marker"',
        'rm -f "$MARKER"',
        "PASS=0; FAIL=0",
        'check() { local n="$1"; shift; if "$@"; then printf "  PASS  %s\\n" "$n"; PASS=$((PASS+1)); else printf "  FAIL  %s\\n" "$n"; FAIL=$((FAIL+1)); fi }',
    ]

    for i, (path, payload) in enumerate(PAYLOADS):
        route = path.lstrip("/")
        first_word = payload.strip().split()[0]
        # Escape single quotes for bash single-quoted string
        safe_word = first_word.replace("'", "'\\''")

        lines += [
            f'body{i}=$(curl -sk "$BASE{path}")',
            f'check "fetch {route}: grep <<< pattern" grep -q \'{safe_word}\' <<< "$body{i}"',
            f'if [ ! -f "$MARKER" ]; then check "no side effect after {route}" true; else check "no side effect after {route}" false; rm -f "$MARKER"; fi',
        ]

    # Pattern 2: piped to python3 (JSON extraction safety)
    lines += [
        f'body8=$(curl -sk "$BASE/combined")',
        'check "pipe to python3 pattern" echo "$body8" | python3 -c "import sys; sys.exit(0 if len(sys.stdin.read()) > 0 else 1)"',
        'if [ ! -f "$MARKER" ]; then check "no side effect after python3 pipe" true; else check "no side effect after python3 pipe" false; rm -f "$MARKER"; fi',
    ]

    # Pattern 3: [] conditionals with curl exit code
    lines += [
        f'code=$(curl -sk -o /dev/null -w \'%{{http_code}}\' "$BASE/command-substitution")',
        'check "status code comparison pattern" test "$code" = "200"',
        'if [ ! -f "$MARKER" ]; then check "no side effect after status code" true; else check "no side effect after status code" false; rm -f "$MARKER"; fi',
    ]

    # Pattern 4: piped to grep
    lines += [
        f'body9=$(curl -sk "$BASE/combined")',
        'if echo "$body9" | grep -q "Organizational Performance"; then check "pipe to grep pattern" true; else check "pipe to grep pattern" false; fi',
        'if [ ! -f "$MARKER" ]; then check "no side effect after pipe to grep" true; else check "no side effect after pipe to grep" false; rm -f "$MARKER"; fi',
    ]

    # Final assertion
    lines += [
        'if [ ! -f "$MARKER" ]; then check "FINAL: no marker file created — metacharacters NOT evaluated" true; else check "FINAL: no marker file created — metacharacters NOT evaluated" false; fi',
        'printf "== D8AD-CAN-008 regression: %d passed, %d failed ==\\n" "$PASS" "$FAIL"',
        '[ "$FAIL" -eq 0 ] && exit 0 || exit 1',
    ]

    return "\n".join(lines) + "\n"


def main():
    global PASS, FAIL
    PASS = 0
    FAIL = 0

    print("D8AD-CAN-008 regression test — shell injection via HTTP response body")
    print("=" * 70)

    # Clean up any stale marker
    if os.path.exists(MARKER):
        os.remove(MARKER)

    # Start malicious HTTP server
    port = find_free_port()
    server = http.server.HTTPServer(("127.0.0.1", port), MaliciousHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"[setup] Malicious HTTP server on 127.0.0.1:{port}")
    print(f"[setup] {len(PAYLOADS)} payload routes")
    print()

    script_content = safe_patterns_bash(f"http://127.0.0.1:{port}")

    # Write the script and execute it
    tmpdir = tempfile.mkdtemp(prefix="d8ad-can-008-")
    script_path = os.path.join(tmpdir, "test_safe_patterns.sh")
    with open(script_path, "w") as f:
        f.write(script_content)
    os.chmod(script_path, 0o755)

    try:
        print("[run] Executing safe-pattern test against malicious server...")
        print()
        result = subprocess.run(
            ["/usr/bin/env", "bash", script_path],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)

        # Parse the bash script's pass/fail from its last line
        if result.returncode != 0:
            print(f"[FAIL] Test script exited with code {result.returncode}")
            sys.exit(result.returncode)

        # Independent side-effect check from Python
        if os.path.exists(MARKER):
            print(f"[FAIL] Marker file {MARKER} EXISTS — injection payload evaluated!")
            os.remove(MARKER)
            sys.exit(1)

        print("[PASS] All shell-injection payloads safely inert.")

    except subprocess.TimeoutExpired:
        print("[FAIL] Test script timed out.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[FAIL] Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        server.shutdown()
        shutil.rmtree(tmpdir, ignore_errors=True)
        if os.path.exists(MARKER):
            os.remove(MARKER)


if __name__ == "__main__":
    main()