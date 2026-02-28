/**
 * lib/queryClient.ts — HTTP Client and React Query Configuration
 *
 * This file sets up the data-fetching layer used throughout the application.
 * It uses TanStack Query (also known as React Query), a library that manages
 * the full lifecycle of server data: fetching, caching, background updates,
 * error states, and loading states.
 *
 * Without React Query you would write this kind of boilerplate in every
 * component that needs data:
 *
 *   const [data, setData] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   useEffect(() => {
 *     fetch('/api/event/foo').then(r => r.json()).then(setData).finally(() => setLoading(false));
 *   }, []);
 *
 * React Query replaces all that with a single `useQuery` call and also handles
 * cache invalidation — automatically re-fetching data when a mutation changes it.
 */

import { QueryClient, QueryFunction } from '@tanstack/react-query';

/**
 * throwIfResNotOk — Converts HTTP error responses into thrown JavaScript errors.
 *
 * The browser's `fetch` API only rejects its promise for network-level failures
 * (no internet, DNS failure, etc.). A server responding with 404 or 500 is
 * considered a "successful" fetch — the promise resolves normally.
 *
 * This helper checks `res.ok` (true for 2xx status codes) and throws a
 * descriptive error for any non-2xx response. This ensures that callers
 * using `await` can rely on a standard try/catch to handle API errors,
 * rather than having to inspect the response status themselves.
 *
 * The error message includes the numeric status code followed by the body text
 * (or the status text if there's no body), giving the user and developer useful
 * diagnostic information.
 */
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * apiRequest — General-purpose HTTP request helper.
 *
 * A thin wrapper around `fetch` that:
 *   - Automatically serialises a request body to JSON and adds the
 *     `Content-Type: application/json` header when `data` is provided.
 *   - Sends credentials (cookies) with every request via `credentials: 'include'`,
 *     which is necessary for session-based authentication to work cross-origin.
 *   - Throws on non-2xx responses (via `throwIfResNotOk`).
 *
 * Returning the raw `Response` (rather than the parsed JSON) gives callers the
 * flexibility to parse the body themselves — e.g. as JSON, text, or blob —
 * depending on what the endpoint returns.
 *
 * @param method  - HTTP verb: 'GET', 'POST', 'PATCH', 'DELETE', etc.
 * @param url     - The API path, e.g. '/api/events'.
 * @param data    - Optional request body. Will be JSON-serialised if provided.
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * UnauthorizedBehavior — Controls what happens when the server returns 401.
 *
 * Some queries should treat a 401 (Unauthenticated) response as "no data"
 * (e.g. checking whether a user is currently logged in), while others should
 * treat it as a hard error that surfaces to the user.
 */
type UnauthorizedBehavior = 'returnNull' | 'throw';

/**
 * getQueryFn — Factory that produces a React Query-compatible query function.
 *
 * React Query's `useQuery` hook needs a `queryFn` that fetches data and either
 * returns it or throws. Rather than writing the same fetch/error-check logic in
 * every query, this factory creates a reusable function with configurable 401
 * handling.
 *
 * The `queryKey` convention used here is an array like `['/api/events', slug]`.
 * Joining the segments with '/' produces the full request URL. This is a compact
 * way to co-locate the cache key and the URL, avoiding duplication.
 *
 * @param options.on401 - What to do on a 401 response:
 *   - 'returnNull': return null (useful for optional auth checks).
 *   - 'throw': throw an error (used for protected data that requires auth).
 *
 * The returned function is typed as `QueryFunction<T>` — the exact signature
 * React Query expects, receiving a context object whose `queryKey` we use to
 * derive the URL.
 */
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join('/') as string, {
      credentials: 'include',
    });

    if (unauthorizedBehavior === 'returnNull' && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/**
 * queryClient — The singleton React Query client instance.
 *
 * This single object is the central in-memory cache for all server data in the
 * app. It's passed to `<QueryClientProvider>` in App.tsx, which makes it
 * available to any component that calls `useQuery`, `useMutation`, or
 * `useQueryClient`.
 *
 * Default options explained:
 *
 *   queryFn:
 *     The default fetch function used by any `useQuery` call that doesn't
 *     provide its own `queryFn`. We use `getQueryFn({ on401: 'throw' })` as
 *     the fallback — unauthenticated queries are an error by default. Individual
 *     queries that need different behaviour supply their own `queryFn`.
 *
 *   refetchInterval: false
 *     Disable automatic polling. React Query can re-fetch data on a timer, but
 *     this app doesn't need real-time updates — data is fetched on demand.
 *
 *   refetchOnWindowFocus: false
 *     Disable re-fetching when the user switches back to this browser tab.
 *     The default React Query behaviour is to re-fetch on window focus (to
 *     pick up data changed in another tab), but for this app that's not needed
 *     and would cause unnecessary network requests.
 *
 *   staleTime: Infinity
 *     Cached data is considered fresh forever (until explicitly invalidated by
 *     a mutation). Without this, React Query would treat all cached data as
 *     "stale" immediately and background-refetch it on every component mount,
 *     which would cause constant re-fetching of event data.
 *
 *   retry: false (both queries and mutations)
 *     Don't automatically retry on failure. Network failures or validation
 *     errors should surface immediately to the user rather than silently
 *     retrying, which could cause duplicate mutations (e.g. creating the same
 *     event twice).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: 'throw' }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
