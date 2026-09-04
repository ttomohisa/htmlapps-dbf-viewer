# Security

## Data boundary

DBF Viewer reads files selected explicitly by the user and processes them inside the browser. It does not upload the files or send their contents to an application server.

The standalone page uses a Content Security Policy with `connect-src 'none'`. There is no analytics, telemetry, remote font, runtime CDN, or API call.

## File handling

DBF, DBT, and FPT input is treated as untrusted binary data. Parsed text is assigned with DOM text APIs rather than injected as HTML. Unknown field types are displayed conservatively.

The application is read-only and does not overwrite the source files. CSV export is initiated explicitly by the user.

## Reporting issues

Please report security issues privately when possible. Do not attach confidential DBF files; create a minimal synthetic reproduction instead.
