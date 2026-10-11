# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub: open this repository's **Security** tab and choose **Report a vulnerability** (GitHub private vulnerability reporting). Don't open a public issue.

Include what you found, how to reproduce it and what impact you expect. We'll acknowledge the report, keep you updated and credit you in the advisory unless you'd rather stay anonymous.

## Supported versions

The web app is in early development. Only the latest commit on `main` gets fixes.

## Threat model in short

- **The server decides.** The app holds no business rules: every permission is enforced by the server's API. Hiding something in the app is a convenience, never a protection.
- **Strict CSP.** The app runs as same-origin scripts only, with no inline scripts and no `eval`, and loads nothing from other hosts ([docs/embedding.md](docs/embedding.md)). The build fails if that changes.
- **Sessions** are HTTP-only cookies the app can't read; changes carry a CSRF token. The app never stores passwords or API keys; a new API key is shown once and then forgotten.
- **Untrusted content.** Titles, descriptions and other metadata come from third parties and are always rendered as text, never as HTML.
- **Offline cache.** The service worker caches the app's own files only, never API responses, pages or covers.
