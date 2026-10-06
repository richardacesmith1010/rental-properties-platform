import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createServerClient(url, anonKey, {
    global: {
      fetch: (input, init) => {
        const count = Reflect.get(globalThis, Symbol.for("domus.perf.countSupabaseRequest")) as
          ((request: RequestInfo | URL) => void) | undefined;
        count?.(input);
        return fetch(input, init);
      }
    },
    cookies: {
      async getAll() {
        const cookieStore = await cookies();
        return cookieStore.getAll();
      },
      async setAll(cookiesToSet) {
        try {
          const cookieStore = await cookies();
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignore writes from Server Components; only Route Handlers/Actions can write.
        }
      }
    }
  });
}
