import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type MutableCookieStore = {
  set: (options: { name: string; value: string } & CookieOptions) => void;
};

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  const cookieStore = cookies();
  const mutableCookieStore = cookieStore as unknown as MutableCookieStore;

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          mutableCookieStore.set({ name, value, ...options });
        } catch {
          // Ignore writes from server components; route handlers/actions can write.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          mutableCookieStore.set({ name, value: "", ...options });
        } catch {
          // Ignore writes from server components; route handlers/actions can write.
        }
      }
    }
  });
}
