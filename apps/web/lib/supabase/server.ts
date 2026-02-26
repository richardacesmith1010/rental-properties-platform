import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          (cookieStore as any).set({ name, value, ...options });
        } catch {
          // Ignore writes from server components; route handlers/actions can write.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          (cookieStore as any).set({ name, value: "", ...options });
        } catch {
          // Ignore writes from server components; route handlers/actions can write.
        }
      }
    }
  });
}
