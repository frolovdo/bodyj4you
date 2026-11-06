#!/usr/bin/env bash
# Test the repo locally (never on GitHub, see CLAUDE.md).
#   scripts/test-local.sh                 everything
#   scripts/test-local.sh miami-dashboard one or more projects
# Exits non-zero if any check fails.
set -u
cd "$(dirname "$0")/.."
APPS=(ad-command-center bodyj4you-return-dashboard china-dashboard miami-dashboard supply-chain-dashboard)
want=("$@")
picked() { [ ${#want[@]} -eq 0 ] && return 0; for w in "${want[@]}"; do [[ "$1" == "$w"* ]] && return 0; done; return 1; }
fail=0
check() { local name="$1"; shift; if out=$("$@" 2>&1); then echo "  ok    $name"; else echo "  FAIL  $name"; echo "$out" | tail -15 | sed 's/^/        /'; fail=1; fi; }

echo "JavaScript syntax"
while IFS= read -r f; do picked "$f" && check "$f" node --check "$f"; done < <(git ls-files '*.mjs' 'automation/*.js' '*/netlify/**/*.js' | grep -v -e '/dist/' -e '/public/')

echo "Python syntax"
while IFS= read -r f; do picked "$f" && check "$f" python3 -m py_compile "$f"; done < <(git ls-files '*.py')

echo "Python tests"
for f in ads/tests/test_*.py; do picked "$f" && check "$f" python3 "$f"; done

echo "Builds"
for app in "${APPS[@]}"; do
  picked "$app" || continue
  # npm ci first; fall back to install without touching the lockfile (some lockfiles are Mac-only)
  check "$app" bash -c "cd '$app' && { npm ci --no-audit --no-fund --silent || npm install --no-package-lock --no-audit --no-fund --silent; } && npm run build --silent"
done

[ $fail -eq 0 ] && echo "All local checks passed." || echo "Some local checks FAILED."
exit $fail
