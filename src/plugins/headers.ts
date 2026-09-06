import { definePlugin } from "nitro";

const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const noCacheHeaders: Record<string, string> = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

function applyHeaders(headers: Headers, extra: Record<string, string>): void {
  for (const [name, value] of Object.entries(extra)) {
    headers.set(name, value);
  }
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("response", (res, event) => {
    applyHeaders(res.headers, securityHeaders);
    if (isApiPath(new URL(event.req.url, "http://n").pathname)) {
      applyHeaders(res.headers, noCacheHeaders);
    }
  });
});
