# Blueprint Implementation Status — Ketab Jibi

این فایل نقشهٔ تطبیق بین بلوپرینت و فایل‌های موجود در مخزن را نشان می‌دهد و وضعیت فعلی هر بخش را ثبت می‌کند.

## Summary
- Design tokens and globals: DONE — `design-tokens.md`, `src/styles/globals.css`
- Local fonts: DONE — `public/fonts/*` and `public/fonts/vazirmatn-local.css`
- Components: PARTIAL — `src/components/EpisodeCard.tsx`, `src/components/Hero.tsx` (basic implementations exist)
- AudioPlayer spec: DONE — `docs/audio-player-spec.md` (singleton design + sample)
- Server/API: DONE — `server.js` implements `/api/uploads`, media streaming, backups, etc.
- Pages & Layout: PARTIAL — static pages exist under `public/`; SPA/Next.js scaffold NOT created

## Actionable Next Steps (recommended order)
1. Player persistence & Context wiring (implement `useAudio` or client `KJAudio` singleton and connect `Hero` & `EpisodeCard`) — Priority: High
2. Integration tests: run `scripts/headless-playback-test.js` and fix any player regressions — Priority: Medium
3. API polishing: document JSON shapes for `/api/uploads` and backup endpoints in `docs/api.md` — Priority: Medium
4. (Optional) Scaffold Next.js project for SPA navigation and sticky player — Priority: Low (requires migration)

## Files to review for each task
- Player wiring: `src/components/Hero.tsx`, `src/components/EpisodeCard.tsx`, `docs/audio-player-spec.md`
- Styles & tokens: `design-tokens.md`, `src/styles/globals.css`
- Server/API: `server.js`, `data/uploads.json`, `docs/components-spec.md`

## Current suggested immediate task
Implement a small `client/js/player.js` that exposes `window.KJAudio` (singleton) and connect `Hero` and `EpisodeCard` to call `window.KJAudio.setSource()` / `play()` so page-level testing is fast without migrating to React Context.

If you approve, I will scaffold `public/js/player.js` and wire minimal event handlers in `src/components/Hero.tsx` and `EpisodeCard.tsx` to call the global player (non-breaking, falls back if not present).
