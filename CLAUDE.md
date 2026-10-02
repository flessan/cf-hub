# CloudFlare Mobile

Unofficial Android app for managing Cloudflare, published on Google Play as
`id.imtaqin.cfmobile`. React Native 0.81 + Expo SDK 54, Expo Router, TypeScript
strict.

## Ground rules

- **Never commit or push unless asked.** Leave work in the working tree.
- **Never build an APK or AAB unless explicitly asked** ("build apk", "build
  aab"). Builds are slow and the user tracks version codes by hand.
- **Never write an API payload from memory.** Look it up first — see below.
- `npx tsc --noEmit` must be clean before any batch counts as done.
- No AI attribution in commit messages. Plain messages, no emoji.
- Updates ship through Google Play, not GitHub releases. Do not add
  GitHub-based update flows.
- `ai-worker/` is deliberately absent from this repo — it is a private premium
  backend kept at `../cfmobile-ai-private/`. Do not re-add it here.

## The Cloudflare API reference

`docs/cf-api/` holds one markdown file per Cloudflare product, generated from
the official OpenAPI schema: 3239 endpoints with paths, query parameters,
request-body fields and the unwrapped `result` shape.

Before adding anything to `services/cloudflare.ts`, read the matching entry.
Start from `docs/cf-api/README.md` to find the product file, then grep it for
the path.

Regenerate after a schema update:

```
npm run cf:schema   # downloads the 23 MB schema to .cf-openapi.json (gitignored)
npm run cf:docs     # rewrites docs/cf-api/
```

## What to work on

`docs/ROADMAP.md` is the running tracker: 54 batches across five tiers, with a
status per batch and a checklist for whichever batch is in progress. Read it
first, update it as work lands. Tier 1 (making existing read-only screens
writable) is the highest value.

## Layout

```
app/                 Expo Router screens
  (tabs)/            dashboard, zones, services, settings
  zone/[id]/         zone-scoped screens (dns, ssl, firewall, email, cache, …)
  d1/ kv/ r2/        storage browsers
  worker-tail/       live Worker logs over WebSocket
components/ui/       Card, Badge, Button, Icon, Loading, EmptyState, SectionHeader
services/            cloudflare.ts (all CF API calls), ai.ts, premium.ts,
                     profiles.ts, monitoring.ts, analytics.ts
contexts/            auth (multi-profile), theme
locales/             12 languages, identical key sets
docs/cf-api/         generated API reference
docs/ROADMAP.md      feature tracker
```

## Running multiple batches in parallel

Each batch in `docs/ROADMAP.md` is meant to be handed to its own agent
(`.claude/agents/cf-batch.md`) so several can run at once.

**Claim your batch first.** `docs/AGENTS_ACTIVE.md` is the live lock file —
before starting a batch, read it, add a row with your agent name and the
batch number, and mark it `claimed`. Check it again before writing to any of
the three shared files below. Update your row to `done` when you finish.
Never start a batch someone else's row already claims.

Two files are shared
across every batch and are the only real collision risk:

- **`services/cloudflare.ts`** — every batch adds a new `// ─── Name ───`
  section. As long as two batches touch different products, appends do not
  overlap. **Never edit a banner or function that belongs to a different,
  in-progress batch** — check `docs/ROADMAP.md` for what is currently `wip`
  before touching existing code near the bottom of the file. If two batches
  are running against the *same* product at once, don't — merge them into one
  batch instead of parallelizing.
- **`locales/*.json`** (12 files) — each batch merges its own new keys under
  its own namespace (`worker.*`, `health_checks.*`, …). Namespaces don't
  collide, but two agents writing the same file at the same wall-clock moment
  can still clobber each other's write. Prefer running the translation step
  serially even when the rest of a batch ran in parallel, or give each parallel
  agent its own git worktree (see below) and merge afterward.
- **`app/_layout.tsx`** — route registration is one line per screen; same
  clobber risk as locale files if two agents save it at the same instant.

For real parallelism (not just conceptually independent batches), run each
agent in its own git worktree rather than the same working tree — the Agent
tool's `isolation: "worktree"` option does this automatically. That turns the
shared-file risk into a normal merge instead of a race. Without worktree
isolation, only parallelize batches that touch entirely disjoint files (e.g.
a new product with its own screen and no shared-file edits until the very end),
and serialize the merge step (locale files, `_layout.tsx`, `ROADMAP.md`
status) after the parallel work finishes.

Batches in the same tier of `docs/ROADMAP.md` are written to be
independent of each other. Batches across tiers sometimes are not (Tier 1
touches screens that already exist; later tiers add new ones) — read the
Scope column, not just the tier number, before assuming two batches are safe
to run side by side.

## Conventions

**API layer.** Everything goes in `services/cloudflare.ts`, grouped by product
under a `// ─── Name ───` banner. Use the private `get` / `post` / `put` /
`patch` / `del` helpers — they return the unwrapped `CFResponse`. Export a
typed interface for every response shape rather than using `any`.

Concretely, adding one endpoint looks like this — read the entry in
`docs/cf-api/<product>.md` first, then write the interface and function
together, right under the product's banner (create the banner if the product
is new to the file):

```ts
// ─── Health Checks ────────────────────────────────────────────────────────

export interface HealthCheck {
  id: string;
  name: string;
  address: string;
  type: 'HTTP' | 'HTTPS' | 'TCP';
  enabled: boolean;
  suspended: boolean;
  status?: string;
}

export async function getHealthChecks(zoneId: string): Promise<CFResponse<HealthCheck[]>> {
  return get(`/zones/${zoneId}/healthchecks`);
}

export async function createHealthCheck(zoneId: string, check: {
  name: string;
  address: string;
  type: HealthCheck['type'];
  check_regions?: string[];
}): Promise<CFResponse<HealthCheck>> {
  return post(`/zones/${zoneId}/healthchecks`, check);
}

export async function updateHealthCheck(zoneId: string, id: string, check: Partial<HealthCheck>): Promise<CFResponse<HealthCheck>> {
  return patch(`/zones/${zoneId}/healthchecks/${id}`, check);
}

export async function deleteHealthCheck(zoneId: string, id: string): Promise<CFResponse<{ id: string }>> {
  return del(`/zones/${zoneId}/healthchecks/${id}`);
}
```

Rules that make this safe to write without seeing a live response:

- Field names, types and which fields are `required` come straight from the
  `docs/cf-api/` entry — do not add a field that is not in the schema, and do
  not mark something optional that the schema lists as required.
- A request type is its own inline object literal (as above), not a `Partial`
  of the full resource, unless the endpoint genuinely accepts a partial patch.
- When a response nests the payload (`{items: [...]}`, `{schedules: [...]}`,
  `{deployments: [...]}`), the return type reflects that nesting — do not
  flatten it away.
- One function per endpoint. Do not fold list+create or update+delete into a
  single function with a mode flag.

**Screens.** Expo Router files. Zone-scoped screens live in `app/zone/[id]/`,
account-scoped ones at the top level. Register new non-tab routes in
`app/_layout.tsx`.

**UI.** Use the primitives in `components/ui/`. Colours from `useTheme()`,
spacing and type from `constants/theme`. Editors are bottom-sheet `Modal`s
(`animationType="slide"`, `rgba(0,0,0,0.5)` overlay, `Button` pinned at the
bottom) — copy the pattern in `app/zone/[id]/firewall.tsx`.

**Icons.** Adding one means adding both the `case` and the name in the
`IconName` union in `components/ui/icon.tsx`.

**Errors.** `e?.response?.data?.errors?.[0]?.message ?? e?.message`. Show them
in an inline error card, not a bare alert, when the screen can still render.

**Destructive actions** go through `Alert.alert` with a `destructive` button.

**Optimistic updates** revert on failure — see `toggleWaf` in firewall.tsx.

**Permissions.** API tokens are often scoped; a 403 on a secondary call should
hide that section, not fail the screen. Wrap optional fetches in
`Promise.allSettled`.

## Translations

All 12 locales in `locales/` must carry identical key sets: `en`, `id`, `es`,
`pt`, `de`, `fr`, `ru`, `ja`, `ko`, `zh`, `tr`, `vi`.

**Use `scripts/i18n-translate.js` — do not hand-write per-language tables.**
Writing out 12 translations per key by hand burns a large number of output
tokens for text a translation API produces in seconds. The script calls
Google's public translate endpoint (no API key needed) and merges the result
into all 12 locale files in one run:

```
node scripts/i18n-translate.js <namespace> <path-to-source.json>
```

`source.json` is a flat `{ key: "English text" }` object for one namespace
(e.g. `worker`, `health_checks`). Write that file with a handful of English
strings — that's the only translation content worth spending tokens on — then
let the script produce the other 11 locales. `{{placeholder}}` interpolation
tokens are protected before translating and restored after, so they survive
intact. The script itself asserts every locale ends up with the same keys as
`en.json` and prints anything missing.

Spot-check a couple of non-English strings after running it (machine
translation occasionally mistranslates a short UI label out of context), but
do not retype the whole table by hand to do so. Never leave a locale short,
and never fill a locale by copying English into it.

**Known gotcha, already fixed once — watch for it recurring.** When a source
string is *entirely* a single protected token (a `{{placeholder}}` or a whole
`BRAND_NAMES` entry, e.g. `zone.snippets: "Snippets"`), some target languages
"correct" the fake placeholder word instead of leaving it alone — Spanish and
Korean respell it, Chinese translates the literal word "PLACEHOLDER" inside
it. The script's placeholder format is digit-only specifically to avoid this
(see the comment above `MARK_PREFIX` in `scripts/i18n-translate.js`). If you
ever change that format back to something word-shaped, or write a second
translate script, keep it digit-only. To check whether existing locales have
this corruption: `grep -rn "OLDERX[0-9]\+X\|占位符" locales/*.json` should
return nothing.

## Monetization

Two products, both verified server-side by the private worker:

- `premium_remove_ads` — one-time purchase, removes ads and unlocks Monitoring
- `cfmobile_ai_monthly` — subscription, raises the AI action quota

Billing may be unavailable (emulator, no Play services). `isBillingAvailable()`
in `services/premium.ts` guards every billing call; respect it.
