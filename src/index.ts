export * from "./generated";
export { iterate, listAll } from "./helpers/pagination";
import { client } from "./generated/client.gen";
import {
  accounts,
  activities,
  balances,
  categories,
  portfolio,
  positions,
  recurring,
  spending,
  tags,
  transactions,
} from "./generated/sdk.gen";

export const cobalt = Object.assign(client, {
  accounts,
  activities,
  balances,
  categories,
  portfolio,
  positions,
  recurring,
  spending,
  tags,
  transactions,
});
