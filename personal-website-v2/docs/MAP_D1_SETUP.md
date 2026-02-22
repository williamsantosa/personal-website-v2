# Visitor map & D1 setup

The landing page has a "Where are you from?" map. Visitors click to drop a pin; coordinates are stored in **Cloudflare D1** (rounded to ~1 km for privacy).

## 1. Create the D1 database

```bash
npx wrangler d1 create visitor-pins
```

Copy the `database_id` from the output.

## 2. Wire the database into the project

Edit `wrangler.jsonc` and replace `YOUR_D1_DATABASE_ID` with the id from step 1:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "visitor-pins",
    "database_id": "<paste-your-id-here>"
  }
]
```

## 3. Run the migration

**Local (dev):**

```bash
npx wrangler d1 execute visitor-pins --local --file=./migrations/0000_create_pins.sql
```

**Production (after deploy):**

```bash
npx wrangler d1 execute visitor-pins --remote --file=./migrations/0000_create_pins.sql
```

## 4. Regenerate types (optional)

```bash
npx wrangler types
```

Then run `astro dev` or `npm run preview` as usual. The map will load existing pins and allow new ones on click.

## Notes

- **Privacy:** Only `lat` and `lng` are stored, rounded to 2 decimals (~1.1 km). No IP or other identifiers.
- **Abuse:** Consider adding rate limiting (e.g. by IP or a simple CAPTCHA) if the map gets spammed.
- **Bots:** The copy asks "how many of the people on here are bots or not" as a light-hearted prompt; you can add bot detection later if you want.
