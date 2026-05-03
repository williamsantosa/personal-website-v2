# personal-website-v2

Personal site built with [Astro](https://astro.build/), React, and Tailwind. It uses **server-side rendering** on Cloudflare via [`@astrojs/cloudflare`](https://docs.astro.build/en/guides/integrations-guide/cloudflare/).

## Cloudflare: Workers, not Pages

This app is deployed as a **Cloudflare Worker** with a [static assets binding](https://developers.cloudflare.com/workers/static-assets/), not as a **Cloudflare Pages** project. That matches Astro’s server output: HTML is rendered on the Worker, and you can use Worker bindings (for example **D1**) from API routes.

In the dashboard, Workers and Pages are grouped under **Workers & Pages**; this project’s Worker name is **`personal-website-v2`**, which matches the `name` field in [`wrangler.jsonc`](./wrangler.jsonc).

If you are used to Pages, Cloudflare’s guide [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) explains the configuration differences (for example `assets.directory` instead of `pages_build_output_dir`, and `wrangler deploy` instead of `wrangler pages deploy`).

## First-time setup on Cloudflare

For the workflow this repo uses, you **do not** need to connect a Git repository in the Cloudflare dashboard. After `wrangler login`, `npm run deploy` uploads the Worker and assets from your machine; the Worker is created on first deploy if it does not exist yet. Linking a repo is **optional** and only for automatic builds—see step 6 ([Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)).

1. **Account and DNS**  
   Use a Cloudflare account. For a [custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), the zone must use Cloudflare’s nameservers (Workers do not support the “CNAME-only” Pages setup for zones hosted elsewhere).

2. **Wrangler login** (once per machine):

   ```sh
   npx wrangler login
   ```

3. **Install and configure**  
   Run `npm install`. Open `wrangler.jsonc` and adjust:
   - **`name`** — Worker name in the dashboard (default: `personal-website-v2`).
   - **`routes`** — Set `pattern` to your hostname (see the comment in the file).
   - **`d1_databases`** — For the visitor map, create a D1 database and paste `database_id` (see [`docs/MAP_D1_SETUP.md`](./docs/MAP_D1_SETUP.md)).

4. **D1 (visitor map)**  
   Follow [`docs/MAP_D1_SETUP.md`](./docs/MAP_D1_SETUP.md): create the database, wire the id, run the SQL migration locally and remotely.

5. **Deploy**  
   From the repo root:

   ```sh
   npm run deploy
   ```

   That runs `astro build` then `wrangler deploy`, uploading the Worker entry (`dist/_worker.js/...`) and static assets from `dist/`.

6. **CI (optional)**  
   To build from Git, use [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) and point the build command at `npm run build` and deploy with Wrangler—this is the Workers path, not the Pages “Connect to Git” flow.

## Preview and local dev

| Command           | What it does |
| ----------------- | ------------ |
| `npm run dev`     | Astro dev server (e.g. `localhost:4321`). |
| `npm run build`   | Production build to `./dist/`. |
| `npm run preview` | `astro build` then `wrangler dev` (local Worker + assets, closer to production). |
| `npm run deploy`  | `astro build` then `wrangler deploy`. |

## Project structure

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
├── wrangler.jsonc
└── package.json
```

Astro turns files under `src/pages/` into routes. Shared UI lives under `src/components/`. Static files go in `public/`.

## Deepwoken talent browser

`/deepwoken` is a talent reference backed by D1. Full setup, migrations, wiki refresh, and file map: **[`docs/DEEPWOKEN_TALENTS.md`](./docs/DEEPWOKEN_TALENTS.md)**.

## Repo docs

| Doc | What it covers |
| --- | ---------------- |
| [`docs/MAP_D1_SETUP.md`](./docs/MAP_D1_SETUP.md) | Visitor map pin storage and first migration. |
| [`docs/DEEPWOKEN_TALENTS.md`](./docs/DEEPWOKEN_TALENTS.md) | Talent pipeline: migrations through `0004`, wiki parse, seed, API and UI pointers. |

## More links

- [Astro docs](https://docs.astro.build)
- [Workers + static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Astro Discord](https://astro.build/chat)
