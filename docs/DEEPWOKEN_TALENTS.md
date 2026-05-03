# Deepwoken talent browser

The `/deepwoken` page lists talents from the wiki. Data lives in D1. The site reads it through an API route. React handles search and filters on the client.

Attribution and contact sit on the page itself. This file is for **you**: how the data gets in, how to refresh it, what the schema means.

## What runs where

- **D1** holds rows for talents, attributes, and prerequisites.
- **`GET /api/deepwoken/talents`** returns JSON. The Worker runs the query.
- **`TalentBrowser`** and **`TalentCard`** are React islands. They do not talk to D1 directly.

## First-time D1 (talents)

Use the same D1 database as the visitor map. Binding name is **`DB`** in `wrangler.jsonc`.

Run migrations **in order**. Local example:

```bash
npx wrangler d1 execute DB --local --file=migrations/0000_create_pins.sql
npx wrangler d1 execute DB --local --file=migrations/0001_rate_limit_pins.sql
npx wrangler d1 execute DB --local --file=migrations/0002_deepwoken_talents.sql
npx wrangler d1 execute DB --local --file=migrations/0003_deepwoken_builds.sql
npx wrangler d1 execute DB --local --file=migrations/0004_alt_group.sql
```

Remote is the same with `--remote` instead of `--local`.

Then load seed data (see below).

## Refresh talent data from the wiki

Do this when the wiki changes and you want the site to match.

**1. Get wikitext**

The parser expects Fandom wikitext for the Talents page. Save it as `scripts/wiki-talents-raw.txt`.

You can call the MediaWiki API yourself. Note: plain `fetch` from Node may hit bot blocks. Use a browser, `curl`, or a tool that works from your network.

**2. Parse**

```bash
node scripts/parse-talents.mjs
```

Outputs:

- `scripts/seed-talents.sql` — bulk replace for D1
- `scripts/talents-debug.json` — sanity check by eye

**3. Load local D1**

```bash
npx wrangler d1 execute DB --local --file=scripts/seed-talents.sql
```

Run `npm run dev` and open `/deepwoken`.

**4. Load production**

```bash
npx wrangler d1 execute DB --remote --file=scripts/seed-talents.sql
npm run deploy
```

The seed script wipes talent-related rows and inserts fresh ones. Run it only when you intend to replace data.

## Schema notes

**`builds` / `build_talents`**

These tables exist for a future “save builds” feature. They can stay empty until you build that flow.

**`alt_group` (migration `0004_alt_group.sql`)**

Some talents need “this **or** that” rules. Rows with the same `alt_group` number form one OR-group. `NULL` means required in the usual AND sense. This matches how a build checker would evaluate prerequisites.

## Key files

| Path | Role |
|------|------|
| `scripts/wiki-talents-raw.txt` | Raw wiki source for the parser |
| `scripts/parse-talents.mjs` | Builds SQL + debug JSON |
| `scripts/seed-talents.sql` | Generated; do not hand-edit for routine updates |
| `migrations/0002_*.sql` | Core talent tables |
| `migrations/0003_*.sql` | Build tables (future use) |
| `migrations/0004_*.sql` | `alt_group` on attributes and prerequisites |
| `src/pages/api/deepwoken/talents.ts` | API |
| `src/components/deepwoken/TalentBrowser.tsx` | Search and filters |
| `src/components/deepwoken/TalentCard.tsx` | One card; rarity styling lives here and in `global.css` |

## UI polish

The **Common** rarity badge uses a custom class so it stays readable on dark cards. See `.talent-badge-common` in `src/styles/global.css`.
