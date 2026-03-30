# Copilot Memory Handover

Last updated: 2026-03-31
Repo: ShinichiZero/quotes
Branch: main

## What was done

- Built and wired the new Next.js Aeterna site in `aeterna/`.
- Hardened deploy workflow to avoid install failures.
- Published static export artifacts at repo root to match current Pages behavior.

## Key commits (latest first)

- `a2a563f` fix: publish aeterna export at pages root
- `76edc57` fix: harden pages install/build workflow
- `0b94474` fix: include aeterna package manifests for CI install
- `525cff0` fix: repair pages workflow and github pages base path
- `7ad272d` fix: force AntiGravity app deploy and kill stale cache

## Deploy status

- Latest workflow run: `23771031072` (head `a2a563f`) finished **success**.
- Workflow URL:
  - https://github.com/ShinichiZero/quotes/actions/runs/23771031072

## Important discrepancy to continue from

- Remote `main` branch `index.html` contains **Aeterna** markers (`Aeterna`, `Ancient Wisdom`).
- Public URL `https://shinichizero.github.io/quotes/` was still observed serving old **Saints & Wisdom** UI at last check.
- This suggests either:
  - GitHub Pages source/config does not match expected branch/folder, or
  - stale CDN/client cache is still serving old output.

## Fast resume checklist (VS Code cloud)

1. Open repository settings in GitHub: **Pages**.
2. Confirm source branch/folder used by Pages (main/root vs gh-pages).
3. Match deployment target to chosen source:
   - If Pages serves `main` root: keep exported files at repo root.
   - If Pages serves `gh-pages`: use workflow deploy step to `gh-pages` and remove root-export strategy.
4. Re-check live URL and verify these strings:
   - Must contain: `Ancient Wisdom`
   - Must not contain: `Saints & Wisdom`

## Notes

- Previous CI install failures were resolved by workflow hardening.
- Current blocker is no longer CI; it is live Pages serving mismatch.