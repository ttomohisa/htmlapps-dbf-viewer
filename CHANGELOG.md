# Changelog

## v1.0.0 - 2026-09-04

- First stable release.
- Finalize the shared Data Viewer-series UI and per-file tab state handling.
- Verify multi-file loading, invalid-file isolation, paging, Cell Inspector, CSV export, Japanese/English UI, and mobile layout.
- Finalize the Browser Kitty `#16624F` labeled-file + magnifier SVG icon and favicon.
- Refresh release documentation and Japanese/English screenshots.
- Re-render the active file status when switching languages so the status banner matches the selected UI language.

## v0.1.4
- redesign the Viewer icon as a labeled file with a magnifying glass
- use Browser Kitty primary color `#16624F` for the app icon and favicon
- keep the header icon and `assets/favicon.svg` visually consistent

## v0.1.3
- update the app icon and favicon to make the file type easier to recognize
- add a viewer-style magnifier motif while keeping the Browser Kitty look

## 0.1.2

- Register all dropped DBF files before parsing so one broken file cannot stop the rest of a batch.
- Keep parse/read errors scoped to the affected file tab and clear stale content on error tabs.
- Allow files to be dropped anywhere in the app after a file is already open.
- Show the active valid file's ready status consistently with the other Viewer apps.

## 0.1.1

- Prevented failed DBF additions from leaving an error banner on another open tab
- Scoped page-read errors and truncated-file warnings to the active DBF tab

## 0.1.0 - 2026-09-03

- Initial DBF Viewer implementation based on htmlapps-template v1.2.2.
- Added local DBF parsing, paged record preview, field inspection, encoding override, DBT/FPT memo association, cell inspector, deleted-record visibility, and current-page CSV export.
- Added responsive desktop/mobile UI and Japanese/English help.
