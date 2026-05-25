# @cobalt-money/sdk

Official TypeScript SDK for the [Cobalt API](https://api.cobaltpf.com).

## Install

```bash
bun add @cobalt-money/sdk
# or: npm install @cobalt-money/sdk
```

## Usage

```ts
import { cobalt } from "@cobalt-money/sdk";

cobalt.setConfig({
  baseUrl: "https://api.cobaltpf.com",
  auth: () => process.env.COBALT_API_KEY!,
});

const { data, error } = await cobalt.accounts.list();
if (error) throw error;
console.log(data);
```

## Auth

Issue an API key from the Cobalt dashboard → Settings → API keys. Pass via bearer token.

## License

MIT
