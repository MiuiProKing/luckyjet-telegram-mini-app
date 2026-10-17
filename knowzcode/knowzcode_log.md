# KnowzCode work log

## MicroFix · 2026-10-16 · Portal polish and code audit

Request: retain the existing AllPredictor theme and improve it slightly; review the code and mobile layout.

Actions:
- Preserved the original palette and branding. Improved text sizes, card corners, touch targets, narrow history columns, tablet header layout and the mobile navigation.
- Restored 27 corrupted Cyrillic display names; preserved all 51 version paths, IDs and their order.
- Enabled CSV downloads and external game windows in the original-app iframe; retained opener protections on the separate-window link.
- Focus the main content after PIN entry and provide a hash-route-safe skip link. Announce connection state and catalogue result counts.
- Removed an unresolved legacy script reference from the portal HTML. The portal already reads the public Supabase feed through its React query.

Verification:
- TypeScript `--noEmit`: passed.
- Vite production build: passed.
- Vitest: 3 files / 16 tests passed. This Windows host exceeded the installed runner's worker startup timeout. The final run temporarily extended only the ignored installed runner's startup allowance, then restored its exact contents; tracked test/runtime settings are unchanged.
- Headless browser: 39 layout checks across 320, 375, 390, 768, 820 and 1280 px; PIN, home, catalogue, history, settings and Classic viewer. No horizontal overflow or header collision was found.
- All 51 portal viewer routes produced their original iframe URLs. These checks do not certify every embedded legacy application's internal controls.
- Real public Supabase status/history requests returned HTTP 200. A separate intercepted 1000.99× fixture checked narrow history layout; it was not written to the database or production source.
- Client-side application errors: zero in the browser run.

Local evidence: `outputs/portal-polish-20261016/` in the task workspace (browser JSON, screenshots and host-only test wrapper).

Codex appearance: the user's current theme is retained. Theme import is manual under the Material Themes skill. Optional readability adjustment: keep current colors/fonts and increase UI/code font sizes by one step in Settings → Appearance. No Codex settings were changed automatically.
