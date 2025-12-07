This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Lokální režim

1. Spusťte Python backend nebo nastavte proměnnou `PY_DASHBOARD_SCRIPT` tak, aby ukazovala na skript vracející JSON (viz `lib/pythonClient.ts`). Pokud proměnná není nastavená, použijí se demo data.
2. Nainstalujte závislosti a spusťte Next aplikaci:

```bash
npm install
npm run dev
```

3. Otevřete [http://localhost:3000/login](http://localhost:3000/login) a přihlaste se heslem `solax` (změňte proměnnou `DASHBOARD_PASSWORD`).

### Konfigurace

- `DASHBOARD_PASSWORD` – jednoduché heslo používané pro lokální vývoj.
- `DASHBOARD_PASSWORD_HASH` – SHA-256 hash hesla (pokud je nastaven, má přednost před `DASHBOARD_PASSWORD`). Hash vygenerujete např. příkazem `echo -n "heslo" | shasum -a 256`.
- `PY_BACKEND_URL` – URL Python backendu. Aplikace odešle POST s JSON `{ filters }` a očekává zpět payload se sekcemi `summary` a `history`.
- `PY_BACKEND_TIMEOUT` – timeout HTTP požadavku na backend (ms), výchozí 10000.
- `PY_DASHBOARD_SCRIPT` – cesta k Python skriptu vracejícímu JSON payload.
- `PY_WORKDIR` – pracovní složka, ze které se skript spouští.
- `IMPORT_LOG_PATH` – cesta k JSON souboru, kam se ukládá historie importů (výchozí `/tmp/import-jobs.json`).
- `IMPORT_WEBHOOK_SECRET` – tajný klíč, kterým se autorizuje backend při volání `POST /api/imports/update`.
- `IMPORT_CALLBACK_URL` – URL Next.js webhooku (typicky `http://localhost:3000/api/imports/update`), kam Python backend hlásí stav importu. Musí odpovídat `IMPORT_WEBHOOK_SECRET`.
- `IMPORT_REDIS_REST_URL` + `IMPORT_REDIS_REST_TOKEN` – pokud jsou nastavené, historie importů se ukládá do Redis (např. Upstash REST API) místo lokálního souboru. `IMPORT_REDIS_INDEX_KEY` a `IMPORT_REDIS_DATA_PREFIX` je možné upravit pro názvy klíčů. Při chybě Redis se aplikace automaticky vrátí k souborovému úložišti.
- `SOLAX_TOKEN_ID` + `SOLAX_WIFI_SN` – pokud jsou nastavené, dashboard načítá realtime data z [SolaX Cloud API](https://global.solaxcloud.com/api). Volitelně lze upravit `SOLAX_BASE_URL` a `SOLAX_TIMEOUT`.
- `ELECTRICITY_PRICE_API_URL` – volitelná URL pro hodinové/čtvrthodinové ceny (výchozí `https://api.electricitypriceapi.com/v1/prices`).
- `SPOTOVA_API_URL` – volitelná URL fallbacku (výchozí `https://spotovaelektrina.cz/api/v1/price/get-prices-json`).
- `ENTSOE_API_TOKEN` + `ENTSOE_BIDDING_ZONE` – pokud jsou nastavené, slouží jako poslední fallback spotových cen přes ENTSO-E Transparency API (výchozí zóna `10Y1001A1001A47J` pro ČR).
- `SPOT_PRICE_STORE_PATH` – cesta k JSONu, kam se ukládají poslední stáhnuté spotové ceny (výchozí `./data/spot-prices.json`).
- `ENERGY_DB_PATH` – cesta k hlavní SQLite databázi, kam se ukládají spotové ceny, SolaX i Tigo data (výchozí `./data/energy.db`). Při prvním použití proběhne jednoduchá migrace.
- Aplikace předává Python skriptu proměnné `DASHBOARD_RANGE` a `DASHBOARD_SOURCE` podle zvolených filtrů na dashboardu.

Pokud je nastaven `PY_BACKEND_URL`, použije se HTTP endpoint. Jinak se spustí `PY_DASHBOARD_SCRIPT`. Pokud není k dispozici ani jedno (nebo dojde k chybě), načtou se demo data.

### API endpoints

- `POST /api/login` – jednoduchá autentizace přes heslo.
- `POST /api/logout` – zruší session cookie.
- `GET /api/dashboard` – načte data z Python skriptu nebo vrátí demo (akceptuje query parametry `range` a `source` shodné s filtry ve UI).
- `POST /api/upload` – přijme Excel (.xlsx) a uloží ho; vyvolá backend import a zapíše položku do historie.
- `GET /api/imports` – vrátí poslední zaznamenané importy (chronologicky).
- `POST /api/imports/update` – přijme notifikaci od Python backendu a aktualizuje stav importu (`jobId`, status `queued|processing|done|failed`, nepovinná message). Vyžaduje hlavičku s tajným klíčem (`IMPORT_WEBHOOK_SECRET` v JSON payloadu).
- `GET /api/imports/stream` – SSE stream historie importů (aktualizace každých pár sekund), využívá ho frontend pro zobrazení stavu importů v reálném čase.
- `GET /api/spot/history` – vrátí posledních několik dní spotových cen (min/průměr/max v Kč/kWh) z úložiště (JSON/SQLite).
- `POST /api/spot/update` – spustí ruční načtení spotových cen (API → SQLite) a vrátí datum, které se aktualizovalo.

### Skripty

- `scripts/seed-imports.ts` – vytvoří demo importní joby (spouští se přes `npx ts-node scripts/seed-imports.ts`).
- `scripts/fetch-spot-history.ts [from] [to] [outputDir]` – stáhne historické spotové ceny z electricitypriceapi.com a uloží je do JSON souborů (default od `2022-01-01` do dneška do `./data/spot-history`).
- `scripts/persist-spot-prices.ts` – stáhne aktuální spotové ceny a uloží je do souboru definovaného `SPOT_PRICE_STORE_PATH` (vhodné pro cron).
- `scripts/import-energy-data.ts --solax "path/*.xlsx" --tigo "path/*.csv"` – zpracuje SolaX XLS a Tigo CSV soubory a uloží je do SQLite (detekuje 15min/hodinové intervaly a deduplikuje data podle časových bucketů).
- `python3 processor.py serve [--host 127.0.0.1 --port 8787]` – spustí Python backend, který vrací dashboard payload (`POST { filters }`) a přijímá importní joby (`type: "excel-import"`). Příkazy `python3 processor.py import-solax FILE` a `python3 processor.py import-tigo FILE` provedou jednorázový import do SQLite bez HTTP serveru.
- `scripts/backfill-spot-prices.ts --from 2022-01-01 --to 2025-12-31` – projde den po dni dané období, zavolá `fetchSpotPrices(date)` a každé úspěšné načtení uloží do SQLite přes `saveSpotPrices`. Hodí se pro rychlé naplnění historických spot cen.

### Frontend

- Dashboard využívá layout se souhrnnými kartami, grafem (Recharts) a formulářem pro nahrání Excelu.
- Hlavička obsahuje filtry na období (24 h, 7 dní, 30 dní, 90 dní, tento/ minulý rok), zdroj dat a časový interval (15 min / hodina / den); hodnoty se propsaly do URL a používají se při dotazu na Python backend.
- Login stránka je dostupná na `/login` a chrání všechny ostatní routy middlewarem.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
