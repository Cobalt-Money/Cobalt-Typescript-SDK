import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "./openapi.json",
  output: {
    format: "prettier",
    path: "src/generated",
  },
  plugins: [
    "@hey-api/client-fetch",
    "@hey-api/schemas",
    {
      enums: "javascript",
      name: "@hey-api/typescript",
    },
    {
      asClass: true,
      classNameBuilder: (name) => name.charAt(0).toLowerCase() + name.slice(1),
      methodNameBuilder: (operation) => {
        // operationId like "accounts_list" → method "list"; strip the resource
        // prefix so callers get `AccountsService.list()` instead of `.accountsList()`.
        const id = operation.operationId ?? operation.id ?? "";
        const idx = id.indexOf("_");
        return idx >= 0 ? id.slice(idx + 1) : id;
      },
      name: "@hey-api/sdk",
    },
  ],
});
