# Spool

A quiet composer for Bluesky and the Atmosphere. You write without the feed in front of you. When a draft goes past 300 characters, Spool suggests a **thread** or an **article**, preselecting whatever you picked last time. Tick "Remember my choice" and it stops asking.

- **Web app** (SvelteKit): the composer, scheduled posts, and server-rendered article pages.
- **Browser extension** (WXT + Svelte): the same composer in a side panel. Press `Alt+Shift+S` on any page; the page's link and your selected text are pulled in.

## Layout

```
packages/core       TypeScript, no UI. Splitting, rich text, records, publishing.
packages/ui         Svelte 5 composer shared by both apps.
apps/web            SvelteKit: composer at /, articles at /{did}/{rkey}, index at /{did}
apps/extension      WXT side panel (Chrome) / sidebar (Firefox)
```

### How a draft becomes records

| Draft | What gets written |
| --- | --- |
| ≤ 300 graphemes, ≤ 4 images | One `app.bsky.feed.post`. A link card comes from Bluesky's card service when there are no images. |
| Thread | Posts are written one at a time, each replying to root and parent. Record keys (TIDs) are generated up front, so a failure halfway can be resumed: finished posts are skipped and the rest go to the same keys, with no duplicates. |
| Article | A `site.standard.document` (markdown in [`at.markpub.markdown`](https://markpub.at) content, plain text in `textContent`) and an announcement post with a link card, written together in **one `applyWrites`**, so you never get a post pointing at a missing article. The post's strong ref is then written back to the document as `bskyPostRef`. A `site.standard.publication` is created the first time you publish. |

**The thread splitter** (`packages/core/src/split.ts`) breaks at paragraphs first, then lines, then sentences, then words. It only ever splits on whitespace, so links, mentions and hashtags stay whole. It counts graphemes, and it counts links at the shortened length Bluesky displays them. With `1/n` numbering on, it re-splits whenever n gains a digit.

**Scheduled posts** (web app only). The clock next to Post picks a time. The draft goes to D1, its images to R2, and a cron trigger publishes whatever is due every minute. Each post is claimed with a lease, so overlapping runs never publish it twice. Record keys, and a thread's split, are reserved before the first attempt, so a retry writes to the same keys. Failures are retried after 1, 5, 15 and 60 minutes, then the post is marked failed and shows up under "Needs attention". Losing access to the account fails it straight away. "Edit" takes a post off the schedule and back into the composer.

**Sessions.** The web app signs in on the server, as a confidential OAuth client. Its token requests are signed with `OAUTH_PRIVATE_KEY`, which gets it sessions long enough to publish days later. Tokens and DPoP keys are stored in D1, and the browser only holds a session cookie. Signing out revokes the grant, unless posts are still waiting to go out. The extension still signs in and publishes from the browser, so it can't schedule. Handles and DIDs are resolved by the atproto libraries. Those fetch with `redirect: 'error'`, which Workers reject, so `patches/` switches them to `'manual'`. Every call site already rejects non-2xx responses, so redirects still fail rather than being followed. The patches are pinned to exact versions: when pnpm refuses to apply one after an upgrade, check whether the new version still needs it.

**Scopes.** Sign-in asks for granular scopes only: create posts, write `site.standard.*`, upload images. Profiles and handles are read from the public AppView. If your PDS doesn't support granular scopes yet, change `OAUTH_SCOPE` in `packages/core/src/oauth.ts` to `atproto transition:generic`.

## Develop

```sh
pnpm install
pnpm --filter @spool/web db:migrate:local   # once, and after adding a migration
pnpm test          # core: splitter, records, markdown, publish flows (in-memory PDS)
pnpm check         # svelte-check / tsc across packages
pnpm lint          # oxlint
pnpm fmt           # oxfmt (use fmt:check in CI)
pnpm dev           # web app on http://127.0.0.1:5173
```

Local sign-in uses an atproto **loopback client**, so it needs no key or hosted metadata, but its sessions are short. Use `127.0.0.1`, not `localhost`. `vite dev` gets local D1 and R2 through wrangler's platform proxy. It has no cron trigger, so the scheduler runs whenever the scheduled list refreshes (`POST /api/dev/run-scheduled`). `pnpm --filter @spool/web preview` runs the real Worker; trigger its cron with `curl "http://127.0.0.1:4173/__scheduled?cron=*+*+*+*+*"`.

> **Set `PUBLIC_APP_ORIGIN` before publishing a real article**, even in dev. The article URL is written permanently into the record and the link post. If it isn't set, the URL uses whatever origin you're on, which means `127.0.0.1` in dev.

## Deploy the web app

The web app runs on Cloudflare Workers (`@sveltejs/adapter-cloudflare`). Production is `https://spool.at`; the domain, the Worker name and the runtime variables live in `apps/web/wrangler.jsonc`.

First time only:

```sh
cd apps/web
pnpm exec wrangler login
pnpm exec wrangler d1 create spool                    # put the database_id in wrangler.jsonc
pnpm exec wrangler r2 bucket create spool-scheduled-images
node scripts/oauth-key.mjs | pnpm exec wrangler secret put OAUTH_PRIVATE_KEY
```

Then, for each deploy (apply migrations first when there are new ones):

```sh
pnpm --filter @spool/web db:migrate                # D1 migrations, remote
pnpm deploy:web                                # vite build && wrangler deploy
pnpm --filter @spool/web preview               # the built Worker locally, on http://127.0.0.1:4173
```

Use `pnpm deploy:web`, not `pnpm deploy`, which is a built-in pnpm command.

`.env` is only read by `vite dev`. The deployed Worker gets `PUBLIC_APP_ORIGIN`, `PUBLIC_EXTENSION_REDIRECT_URIS` and the optional `ATPROTO_*` overrides from `vars` in `wrangler.jsonc`.

The app serves its OAuth client metadata at `/oauth/client-metadata.json`. That URL is the `client_id`, and the authorization server fetches it from its own servers, so keep Bot Fight Mode, "I'm Under Attack" and any WAF challenge off for `/oauth/client-metadata.json`, `/jwks.json` and `/extension-client-metadata.json`. These are sent with `cache-control: no-cache`; don't let a Cloudflare cache rule override that. Authorization servers keep their own copy for about 10 minutes, so a metadata change takes that long to reach them. A stale copy stuck in a cache means "redirect_uri not registered" errors until it expires.

Keep `OAUTH_PRIVATE_KEY` stable. If you rotate it, sessions signed with the old key stop refreshing, and everyone has to sign in again.

`wrangler.jsonc` points `main` at `worker/index.ts`, which wraps SvelteKit's output and adds the cron handler. The adapter reads `svelte.wrangler.jsonc` instead, to learn where to write that output. Publishing runs inside the Worker, so the Workers Paid plan's CPU limits are the comfortable fit.

Article and index pages send `s-maxage`, and the adapter's worker stores those responses in Cloudflare's edge cache. That only happens on the custom domain; `*.workers.dev` URLs skip the cache.

## Extension

1. Deploy the web app first. The extension's OAuth client metadata is served from it at `/extension-client-metadata.json`, because an extension can't host its own.
2. Pin the extension ID so its redirect URI is stable. Generate a key, put the public key in `SPOOL_EXTENSION_KEY`, and read the ID from `chrome://extensions`.
3. Set `PUBLIC_EXTENSION_REDIRECT_URIS` in `vars` in `apps/web/wrangler.jsonc` to `https://<extension-id>.chromiumapp.org/`. For Firefox, add the value of `browser.identity.getRedirectURL()`, comma separated.
4. Build:
   ```sh
   WXT_SPOOL_ORIGIN=https://spool.at pnpm --filter @spool/extension build
   # load apps/extension/.output/chrome-mv3 as an unpacked extension
   ```

Sign-in uses `browser.identity.launchWebAuthFlow`. The flow is: `authorize()` with the chromiumapp.org redirect, the provider page opens in an identity window, then the returned URL goes to `callback()`. Tokens are DPoP-bound, and the keys are held in the extension's own IndexedDB.

Permissions are `activeTab` + `scripting` (to read the current page's URL and selection only when you invoke Spool), `storage` (preferences sync across browsers), `identity` and `sidePanel`. There are no host permissions.

## Design notes

The palette is warm paper with one accent (vermilion). The type is Geist for UI, Newsreader for writing and reading, and Geist Mono for identifiers. Labels are sentence-case serif italics rather than all-caps. Links in the post previews use Bluesky's blue on purpose, so the preview matches what people will see in the app. For the same reason, avatars in previews are circles.

`/privacy` describes what this codebase does. If you host it, check that the page is still true for your setup.

## Known gaps / next steps

- **Not yet tested against a live PDS.** The build sandbox had no network access to Bluesky. The publish flows are covered by unit tests against an in-memory PDS, and the reader was checked against a mock PDS. Do a real sign-in and publish before trusting it.
- **The extension redirect URI is the main risk.** The atproto OAuth spec allows a web client's redirect URI to be on a different origin from its `client_id`. Whether bsky.social's authorization server accepts `*.chromiumapp.org` has not been verified. If it doesn't, the fallback is to redirect to a page on the web app that forwards the code to the extension.
- **Articles:** the first image is the cover. Inline images need their blobs referenced from the record so the PDS doesn't garbage-collect them. That's planned, not built.
- **`.well-known/site.standard.publication` verification** is per-domain, so it can't prove ownership for many writers sharing one origin. Custom domains per publication would solve it.
- **Drafts are per device** (IndexedDB). There is one autosaved draft per app.
