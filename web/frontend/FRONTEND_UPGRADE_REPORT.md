# Frontend Upgrade Report

## Baseline (before optimization pass)

- Build command: `npm run build`
- Build time: ~3.8s on current machine
- Main heavy chunks (gzip):
  - `xlsx` ~143 kB
  - `vendor-firebase-data` ~104 kB
  - `jspdf` ~118 kB
  - `vendor-react` ~68 kB
  - `html2canvas` ~48 kB
- Main risks found:
  - API requests had no timeout and no deduplication for concurrent GET calls.
  - Auth API branch returned raw backend errors in some paths.
  - Loading/empty/error UI patterns were inconsistent across pages.
  - Mobile layout used expensive visual effects even on low-end devices.
  - No skip-link for keyboard accessibility.

## Implemented in this iteration

- API layer hardened: timeout, in-flight GET dedupe, structured `ApiError`, centralized auth-failure hook.
- Auth flow hardened for API mode: consistent user-facing errors and forced local cleanup on auth failures.
- Unified async feedback primitives introduced (`LoadingState`, `EmptyState`, `ErrorState`).
- Pages updated to use unified states (`HistoryPage`, `DirectorReportsPage`).
- UX/a11y improvements:
  - Header title corrected.
  - Added skip link to main content.
  - Reduced heavy visual effects on mobile for better responsiveness.

## Release checklist

- [ ] `npm run build` passes
- [ ] Smoke: login + register (valid/invalid cases)
- [ ] Smoke: isolator flow (`/form`, `/history`)
- [ ] Smoke: director flow (`/director`, reports list, export)
- [ ] Smoke: admin flow (`/admin/users`)
- [ ] Verify offline/online indicator behavior
- [ ] Verify keyboard tab order and skip-link
- [ ] Verify API auth failure leads to clean local logout state
