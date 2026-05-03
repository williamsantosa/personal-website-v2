# Visitor map and D1

The home page has a “where are you from?” map. Clicks drop a pin. Pins live in **Cloudflare D1**. We round coordinates to about one kilometer. That is enough for a map. It hides exact addresses.

## Create the database

```bash
npx wrangler d1 create visitor-pins
```

Copy `database_id` from the output.

## Wire it in

Open `wrangler.jsonc`. Put your id where it says to. The binding name is `DB`. The database name in the file should match `visitor-pins` unless you changed it when you created the database.

## Run the migration

**On your machine (local D1):**

```bash
npx wrangler d1 execute visitor-pins --local --file=./migrations/0000_create_pins.sql
```

**In production (after you deploy the Worker config):**

```bash
npx wrangler d1 execute visitor-pins --remote --file=./migrations/0000_create_pins.sql
```

If you use the same D1 for other features, run the rest of the migrations in order. See [`DEEPWOKEN_TALENTS.md`](./DEEPWOKEN_TALENTS.md) for the talent tables.

## Types (optional)

```bash
npx wrangler types
```

Then run `npm run dev` or `npm run preview`. The map loads pins. New clicks add pins.

## Notes

- **Privacy:** We store `lat` and `lng` only. They are rounded. We do not store IP or names on the pin row by default.
- **Abuse:** Add rate limits if strangers spam you.
- **Bots:** The UI joke about bots is optional. You can add checks later.
