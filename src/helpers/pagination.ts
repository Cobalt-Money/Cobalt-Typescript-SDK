/**
 * Pagination helpers on top of the cursor-based list endpoints.
 *
 * Both helpers throw on the first transport error — callers do not need to
 * branch on the `{ data, error }` discriminator inside the loop.
 *
 * Today only `cobalt.transactions.list` is paginated. The helpers are typed
 * generically so adding a new paginated endpoint requires no helper changes:
 * any method whose response is `{ items, hasMore, nextCursor }` and whose
 * options accept `{ query?: { cursor?, limit? } }` is supported.
 */

type Paginated<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

type ListOptions = {
  query?: {
    cursor?: string;
    limit?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type ListResult<T> = {
  data?: Paginated<T>;
  error?: unknown;
};

type ListFn<T> = (options?: ListOptions) => Promise<ListResult<T>>;

/**
 * Iterate every page of a cursor-paginated list endpoint, yielding one item
 * at a time. Memory-bounded — does not buffer the full result set.
 *
 * @example
 *   for await (const txn of iterate(cobalt.transactions.list, {
 *     query: { startDate: "2026-01-01", limit: 200 },
 *   })) {
 *     console.log(txn.id);
 *   }
 */
export async function* iterate<T>(
  list: ListFn<T>,
  options: ListOptions = {},
): AsyncGenerator<T, void, undefined> {
  let cursor = options.query?.cursor;
  while (true) {
    const { data, error } = await list({
      ...options,
      query: { ...options.query, cursor },
    });
    if (error) {
      throw error;
    }
    if (!data) {
      return;
    }
    for (const item of data.items) {
      yield item;
    }
    if (!data.hasMore || !data.nextCursor) {
      return;
    }
    cursor = data.nextCursor;
  }
}

/**
 * Collect every page of a cursor-paginated list endpoint into a single array.
 * Convenient for one-shot scripts; prefer `iterate()` for large result sets
 * where you don't need everything in memory at once.
 *
 * @example
 *   const all = await listAll(cobalt.transactions.list, {
 *     query: { startDate: "2026-01-01" },
 *   });
 */
export async function listAll<T>(
  list: ListFn<T>,
  options: ListOptions = {},
): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterate(list, options)) {
    result.push(item);
  }
  return result;
}
