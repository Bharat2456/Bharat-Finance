# Security

- Strict CSP in `index.html` (`script-src 'self'`, no inline scripts, limited `connect-src`); Vercel headers add nosniff, no-referrer, frame denial.
- No keys in source; the test-suite scans for key-like strings. Keys are never sent to any host except the provider you configure, and Gemini/Anthropic keys go in headers, not URLs.
- Browser-held keys are exposed to anything running on the same origin and to anyone using the profile. Use restricted, low-limit keys. A local proxy or your own backend is safer for production use.
- Untrusted text (RSS, AI output) is escaped before rendering.
- The hosted site never asks for broker credentials. The Local Edition asks only for API keys/tokens (never passwords or UPI PINs), stores them in plain text in `data/credentials.json` (permissions restricted where the OS allows), and sends them only to your broker.
- Local Edition server: binds to 127.0.0.1 only, checks Host/Origin (anti DNS-rebinding/CSRF), accepts only JSON POSTs up to 64 KB, serves only the app folder. Risk limits are enforced in the Python program, not the web page.
- Hosted relay: validates symbols, allows only fixed upstream hosts, no open proxy.
- Report vulnerabilities privately via GitHub Security Advisories on the repository.
