// SPDX-License-Identifier: GPL-3.0-or-later

// The security headers the server sends with the app (docs/embedding.md). `vite preview`
// sends the same, and e2e/csp.spec.ts fails on any violation, so the policy and the app
// can't drift apart.
//
// style-src allows inline styles: UI libraries (dialog scroll locking, toasts) insert
// <style> elements at runtime. Scripts stay strictly same-origin, with no inline code or eval.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};
