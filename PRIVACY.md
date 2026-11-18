# Privacy

- No accounts, no analytics, no ads, no telemetry. A test fails the build if tracking code appears.
- **Hosted edition:** prices are fetched through this site's own `/api/*` functions, which request Yahoo Finance for the symbols you open. The host and Yahoo can therefore see which symbols are requested (no account or personal identifier is attached; ordinary request metadata such as IP is visible to them). Nothing is stored by the functions.
- **Local Edition:** the program on your computer calls the data source and your own broker directly. Broker keys are stored in `data/credentials.json` on your computer, **unencrypted**, and sent only to your broker.
- Everything you create (paper accounts, watchlists, journal, predictions, alerts, chat, settings) is stored in **your browser's IndexedDB**. Export/import/clear is in Settings → Privacy centre.
- Hosting still serves the static files, so the host (e.g. Vercel) sees ordinary request logs.
- Network calls happen only if you configure them: a market-data provider, an AI provider, ECB FX rates (frankfurter.app), or an RSS URL you paste. The Privacy centre lists every host contacted this session and what is sent.
- API keys live in memory by default. If you tick *Remember*, they are saved **unencrypted** in IndexedDB; "Clear stored credentials" removes them. Exports exclude keys.
- Theme choice uses `sessionStorage` (this tab only).
- India: you control your own data; there is no controller-side processing by this project. This is not legal advice about DPDP or any regulation.
