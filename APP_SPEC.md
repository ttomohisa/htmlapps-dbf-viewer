# APP_SPEC.md — DBF Viewer

## 1. Product identity

- **Name:** DBF Viewer
- **Version:** v1.0.0
- **Purpose:** Open local DBF files in the browser and inspect their field structure and records without installing database software or uploading the file.
- **Primary users:** People receiving dBASE/FoxPro-style DBF files from legacy business systems, GIS exports, or archived datasets.
- **Release artifacts:** `dist/index.html` and `dist/index.self-extract.html`

## 2. Problem and outcome

DBF files are still encountered in legacy business systems and GIS workflows, but many users only need to inspect the contents quickly. DBF Viewer provides a local, read-only inspection workflow that works directly from one HTML file.

A successful session is:

1. Select or drop one or more `.dbf` files, optionally with matching `.dbt` or `.fpt` memo files.
2. Inspect file information, DBF fields, and a paged record preview.
3. Change text encoding if decoded text looks wrong.
4. Inspect individual cells and memo content.
5. Save or copy the current preview page as UTF-8 CSV.

## 3. Core user flow

1. Open the HTML locally or through GitHub Pages.
2. Drop `.dbf`, `.dbt`, and/or `.fpt` files into the file area or use the file picker.
3. Matching memo files are associated by basename.
4. The selected DBF opens in a tab and displays file information, field definitions, and records.
5. Use page controls and per-page row count to inspect records without decoding the full table into JavaScript objects.
6. Click a cell to inspect the full value. Memo fields load from an attached DBT/FPT file on demand.
7. Edit the CSV output filename and download or copy the current page.

## 4. Functional requirements

- Accept `.dbf` files and optional `.dbt` / `.fpt` companion memo files.
- Allow multiple DBF files in one session and switch between them.
- Register supported DBF files as separate tabs before parsing, so one broken file does not stop the remaining files from opening.
- Keep status, errors, overview, fields, and data scoped to each file tab; switching tabs must never show stale state from another file.
- Allow additional DBF / DBT / FPT drag and drop while files are already open.
- Associate memo files with a DBF when basenames match case-insensitively.
- Parse common dBASE III/IV/FoxPro-compatible headers and 32-byte field descriptors.
- Show file version label, last update date, record count, field count, record length, header length, language-driver byte, and attached memo filename when available.
- Display field name, DBF type, readable type label, length, and decimal count.
- Read only the requested record page from the local `File` using `slice()`; do not expand the whole DBF into record objects.
- Support page sizes 50, 100, 250, 500, and 1,000 rows.
- Support direct page-number jump.
- Show the deletion marker for each record and allow deleted rows on the current page to be hidden or shown.
- Support the common DBF value types C/V, N/F, D, L, I, B, Y, T/@, M, and expose unknown/binary values safely.
- Provide automatic encoding selection from common DBF language-driver IDs and a manual override including Shift_JIS / Windows-31J, UTF-8, Windows-1252, Windows-1250, Windows-1251, GBK, Big5, EUC-KR, and Windows-874.
- Keep the encoding selector in file information rather than the initial empty state.
- Memo cells show a compact reference in the table. Clicking the cell reads the corresponding memo block on demand from DBT or FPT.
- CSV export/copy uses the currently visible preview page and current deleted-row visibility. Memo values are resolved for the exported page when a companion memo file is attached.
- Output filename is user-editable before CSV download. `.csv` is appended automatically.
- Japanese and English are available without reload.
- Help describes actual supported behavior, privacy, memo limitations, and read-only scope.

## 5. Data and privacy

- Selected files remain local to the browser.
- The app performs no runtime network request.
- There is no server storage, login, analytics, telemetry, tracking, or cloud synchronization.
- DBF and memo files are not persisted by the application across reloads.
- Only language preference may be stored in localStorage.
- Downloads occur only after a user action.

## 6. Non-goals

- Editing DBF records or fields.
- Creating or overwriting DBF/DBT/FPT files.
- SQL execution.
- Index-file (`.ndx`, `.mdx`, `.cdx`) support.
- Perfect support for every historical DBF dialect or proprietary field encoding.
- Automatic repair of corrupt DBF files.

## 7. UX and accessibility

- Use the latest htmlapps-template visual system and brand color `#16624F`.
- Initial state clearly asks the user to choose or drop files.
- Errors explain whether the file is too small, header values are invalid, the DBF appears truncated, or a memo companion is missing.
- Desktop shows file information, fields, and data sections together.
- On smartphones, use the template-style fixed bottom navigation for Overview / Fields / Data after a DBF is loaded; only the selected page is shown to avoid a long stacked screen.
- No horizontal page scroll at 320px width. The data table itself may scroll horizontally inside its own container.
- File tabs become a compact select on narrow screens.
- Long filenames wrap safely.
- Dialogs fit inside the viewport and respect safe areas.
- Keyboard focus is visible; help and cell dialogs close with Escape and backdrop click.
- Status messages use `aria-live`.

## 8. Performance expectations

- Header parsing reads only enough bytes to cover the DBF header.
- Record paging reads only the requested byte range from the source DBF.
- Memo content is loaded on demand and for explicit CSV export only.
- A large DBF should be inspectable without creating one JavaScript object per file record.
- Parsing work for a changed/replaced source uses generation tokens so stale page results are discarded.

## 9. Browser target

Current stable desktop and mobile versions of Chromium, Firefox, and Safari. Direct `file://` opening is required.

## 10. Error and recovery behavior

- Reject files smaller than a valid DBF header.
- Reject implausible header or record lengths.
- If declared record count exceeds the bytes available in the file, show a truncation warning and limit paging to physically available records.
- Unknown DBF version bytes may still be opened when the header structure is parseable; label the version as unknown.
- If the selected encoding is unsupported by the browser, explain that and keep the previous working encoding.
- If memo data cannot be resolved, keep the DBF usable and show the memo reference plus an actionable explanation.
- Unsupported field types are displayed as a compact binary/hex representation rather than failing the whole row.

## 11. Acceptance criteria

- Empty state, multi-file load, tab switching, DBF header display, fields, paging, cell inspector, encoding change, memo attachment, deleted-row toggle, CSV copy/download, Japanese/English, invalid-file error, and mobile navigation are implemented.
- `src/index.template.html` contains no runtime external URLs and CSP includes `connect-src 'none'`.
- `build-standalone.ps1` remains template-compatible and generates readable and self-extract variants on Windows.
- Repository retains the template verification scripts and reusable components.
- README and in-app help describe the same feature scope.

## In-app help

The upper-right help button opens a bilingual “使い方と注意事項” / “How to use & notes” dialog covering:

- selecting DBF and optional memo files,
- page navigation and cell inspection,
- encoding override,
- current-page CSV export,
- complete local processing,
- read-only behavior and unsupported DBF dialects/index files.
