import type { Session, User, EmailOtpType } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getSupabaseClient, hasSupabaseConfig } from "./supabase";
import type { ProfileRole } from "./types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profileRole: ProfileRole | null;
  isLoading: boolean;
  isConfigured: boolean;
  authMessage: string | null;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthMessage: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseRedirectParams(url: string) {
  const hash = url.includes("#") ? url.split("#")[1] : "";
  const query = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const combined = [query, hash].filter(Boolean).join("&");
  return new URLSearchParams(combined);
}

async function applyAuthRedirect(url: string) {
  const supabase = getSupabaseClient();
  const params = parseRedirectParams(url);

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }
    return;
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }
    return;
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (error) {
      throw error;
    }
  }
}

async function fetchRole(userId: string): Promise<ProfileRole> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) {
    return "tenant";
  }

  const role = data?.role;
  if (role === "owner" || role === "manager" || role === "tenant") {
    return role;
  }

  return "tenant";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isConfigured = hasSupabaseConfig();
  const [session, setSession] = useState<Session | null>(null);
  const [profileRole, setProfileRole] = useState<ProfileRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) {
      setIsLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    let mounted = true;

    const bootstrap = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.includes("auth")) {
          await applyAuthRedirect(initialUrl);
        }
      } catch {
        setAuthMessage("Sign-in callback could not be validated.");
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      setSession(currentSession);
      if (currentSession?.user?.id) {
        const role = await fetchRole(currentSession.user.id);
        if (mounted) {
          setProfileRole(role);
        }
      }
      setIsLoading(false);
    };

    void bootstrap();

    const authSubscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession?.user?.id) {
        setProfileRole(null);
        return;
      }

      void (async () => {
        const role = await fetchRole(nextSession.user.id);
        setProfileRole(role);
      })();
    });

    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void (async () => {
        try {
          await applyAuthRedirect(url);
          setAuthMessage("Signed in successfully.");
        } catch (error) {
          setAuthMessage(error instanceof Error ? error.message : "Unable to verify sign-in link.");
        }
      })();
    });

    return () => {
      mounted = false;
      authSubscription.data.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, [isConfigured]);

  const sendMagicLink = async (email: string) => {
    if (!isConfigured) {
      setAuthMessage("Mobile environment variables are not configured.");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthMessage("Enter an email address.");
      return;
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: "domus://auth/callback",
      },
    });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAuthMessage("Magic link sent. Open it on this device to finish sign-in.");
  };

  const signOut = async () => {
    if (!isConfigured) {
      return;
    }

    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setSession(null);
    setProfileRole(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profileRole,
      isLoading,
      isConfigured,
      authMessage,
      sendMagicLink,
      signOut,
      clearAuthMessage: () => setAuthMessage(null),
    }),
    [authMessage, isConfigured, isLoading, profileRole, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
