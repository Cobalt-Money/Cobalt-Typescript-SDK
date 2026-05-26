# @cobalt-money/sdk

Official TypeScript SDK for the [Cobalt API](https://api.cobaltpf.com). Works in
Node, Bun, Deno, Cloudflare Workers, and the browser.

- Typed end-to-end from the live OpenAPI spec.
- Methods return `{ data, error }` — no thrown exceptions on HTTP errors.
- Resource payloads are flat (no `data` envelope).
- Async iterator helpers for paginated endpoints.

## Install

```bash
bun add @cobalt-money/sdk
# or: npm install @cobalt-money/sdk
# or: pnpm add @cobalt-money/sdk
```

## Quick start

```ts
import { cobalt } from "@cobalt-money/sdk";

cobalt.setConfig({
  auth: process.env.COBALT_API_KEY!,
});

const { data, error } = await cobalt.accounts.list();
if (error) throw error;
for (const account of data) {
  console.log(account.id, account.balance, account.type);
}
```

Issue API keys from the Cobalt dashboard: **Settings → API keys**. Keys are
prefixed `ck_live_`. Treat them as secrets — do not commit to source or ship
in client-side bundles. See [Browser usage](#browser-usage) for the proxy
pattern.

> **Do not pass** `baseUrl: "https://api.cobaltpf.com"` — it overrides the
> built-in `/v1` suffix and every call 404s. The default is correct.

## Auth

Pass the API key as a string or a callback. Callbacks run per request, so
they're suitable for refreshable tokens.

```ts
// String
cobalt.setConfig({ auth: process.env.COBALT_API_KEY! });

// Sync callback (per-request)
cobalt.setConfig({ auth: () => process.env.COBALT_API_KEY! });

// Async callback (e.g. read from a keystore)
cobalt.setConfig({
  auth: async () => {
    const { value } = await keychain.get("cobalt");
    return value;
  },
});
```

The value is sent as `Authorization: Bearer <key>`.

## Response shape

Every method returns `{ data, error }`. `data` is the typed payload; `error`
is set only when the request fails. The SDK does **not** throw on HTTP
errors — branch on `error` explicitly.

```ts
const { data, error } = await cobalt.accounts.get({ path: { id: "acc_..." } });
if (error) {
  if ("code" in error && error.code === "account_not_found") {
    // 404 path
  } else {
    throw error; // network failure or other 5xx
  }
}
// `data` is typed `Account` here
```

Payloads are flat. There is no inner `data` wrapper.

```ts
// GET /v1/accounts            → Account[]
// GET /v1/accounts/{id}       → Account
// POST /v1/accounts           → Account
// GET /v1/transactions        → { items: Transaction[], hasMore, nextCursor }
// POST /v1/transactions       → Transaction
// GET /v1/positions           → Position[]
// GET /v1/activities          → Activity[]
// GET /v1/balances/snapshots  → BalanceSnapshot[]
// GET /v1/portfolio/snapshots → PortfolioSnapshot[]
// GET /v1/recurring           → RecurringStream[]
// GET /v1/categories          → { categories: Category[], groups: CategoryGroup[] }
// GET /v1/spending            → SpendingItem
// GET /v1/tags                → Tag[]
```

## Sign conventions

Two gotchas worth memorizing:

- **`Account.balance`** is signed. Liability accounts (`type: "credit_card"`
  or `"loan"`) return **negative** balances. Net worth is the unweighted sum:
  ```ts
  const netWorth = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
  ```
- **`Transaction.amount`** is signed but **inverted vs Plaid / Mint**.
  Positive = money out (spending / debit). Negative = money in (refund /
  credit / income). Filter spending with `amount > 0`, income with `amount < 0`.

## Pagination

`/v1/transactions` is the only paginated endpoint. The SDK ships two helpers
on top of the cursor field.

### `iterate` — async iterator

```ts
import { iterate, cobalt } from "@cobalt-money/sdk";

for await (const txn of iterate(cobalt.transactions.list, {
  query: { startDate: "2026-01-01", limit: 200 },
})) {
  // process one transaction at a time, streams across pages
}
```

### `listAll` — collect into one array

```ts
import { listAll, cobalt } from "@cobalt-money/sdk";

const all = await listAll(cobalt.transactions.list, {
  query: { startDate: "2026-01-01", endDate: "2026-05-22" },
});
```

Both helpers throw on the first `error` they encounter — consumer code does
not need to branch on the discriminator.

## Writing data

Manual accounts, manual transactions, tags, and categories support writes
with an API key.

```ts
// Create a manual credit card with $750 owed.
const { data: card, error } = await cobalt.accounts.create({
  body: {
    type: "credit_card",
    subtype: "credit card",
    name: "Apple Card",
    currentBalance: -750, // signed: liabilities negative
    currency: "USD",
  },
});
if (error) throw error;

// Add a manual transaction (positive = spending).
await cobalt.transactions.create({
  body: {
    accountId: card.id,
    amount: 24.5,
    date: "2026-05-22",
    name: "Coffee",
    merchantName: "Blue Bottle",
  },
});
```

## Browser usage

The SDK runs in the browser, but **the API key is a server-side secret**.
Do not embed `ck_live_*` keys in client bundles, mobile apps, or any client
you do not control. Proxy through your own backend.

```ts
// app/api/cobalt/[...path]/route.ts (Next.js)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const upstream =
    `https://api.cobaltpf.com/v1` +
    url.pathname.replace(/^\/api\/cobalt/, "") +
    url.search;
  return fetch(upstream, {
    headers: { Authorization: `Bearer ${process.env.COBALT_API_KEY!}` },
  });
}
```

Point the browser SDK at the proxy:

```ts
cobalt.setConfig({ baseUrl: "/api/cobalt" });
```

## Recipes

### Net worth

```ts
const { data: accounts } = await cobalt.accounts.list();
const netWorth =
  accounts?.reduce((sum, a) => sum + (a.balance ?? 0), 0) ?? 0;
```

### Net-worth timeline (balances + portfolio snapshots)

`balances.snapshots` covers checking / savings / credit. `portfolio.snapshots`
covers brokerage. Liability balance snapshots are already signed-negative
upstream, so a flat sum is correct.

```ts
const [{ data: balances }, { data: portfolio }] = await Promise.all([
  cobalt.balances.snapshots({
    query: { startDate: "2026-01-01", endDate: "2026-05-22" },
  }),
  cobalt.portfolio.snapshots({
    query: { startDate: "2026-01-01", endDate: "2026-05-22" },
  }),
]);

const byDate = new Map<string, number>();
for (const r of balances ?? []) {
  byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.currentBalance);
}
for (const r of portfolio ?? []) {
  byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.value);
}
```

### Spending — last 6 months

```ts
const { data } = await cobalt.spending.get({
  query: { period: "6m", accountType: "all" },
});
console.log(data.totalSpending, data.averageSpending, data.averageLabel);
for (const bucket of data.buckets) console.log(bucket.date, bucket.amount);
```

### Tag a transaction

```ts
const { data: tag } = await cobalt.tags.create({
  body: { name: "reimbursable", color: "amber" },
});
await cobalt.transactions.updateTags({
  path: { transactionId: "txn_..." },
  body: { tagIds: [tag.id] },
});
```

## Errors

`error` is `{ code, error: message }` for documented failures
(`not_found`, validation, etc.) and a thrown fetch failure otherwise.

```ts
const { data, error } = await cobalt.accounts.get({
  path: { id: "acc_missing" },
});
if (error) {
  if ("code" in error && error.code === "account_not_found") return null;
  throw error;
}
```

The full set of error codes is documented per-endpoint in the
[API reference](https://docs.cobaltpf.com/docs/api-reference).

## Reference

- [API reference](https://docs.cobaltpf.com/docs/api-reference)
- [SDK guide](https://docs.cobaltpf.com/docs/sdk)
- [OpenAPI spec](https://api.cobaltpf.com/v1/openapi.json)

## License

MIT
