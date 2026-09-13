import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { api } from "../lib/api";
import { identify, track } from "../lib/analytics";
import { supabase } from "../lib/supabase";
import { supabaseConfigured } from "../lib/env";
import type { UserProfile } from "../lib/types";

type AuthState = {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>;
  signInWithProvider: (provider: "azure" | "google") => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const me = await api.me();
      setProfile(me);
      identify(me.id);
    } catch (error) {
      console.warn("Could not load profile:", error);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadProfile();
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (!active) return;
      setSession(next);
      if (next) {
        await loadProfile();
      } else {
        setProfile(null);
        identify(null);
      }
      if (event === "SIGNED_IN") track("login", { method: "supabase" });
      if (event === "SIGNED_OUT") track("logout");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const requireClient = () => {
    if (!supabase) {
      throw new Error(
        "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env.",
      );
    }
    return supabase;
  };

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireClient();
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const client = requireClient();
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) throw new Error(error.message);
    track("sign_up", { method: "email" });
    // Supabase returns a user without a session when email confirmation is on.
    return { needsConfirmation: Boolean(data.user && !data.session) };
  }, []);

  const signInWithProvider = useCallback(async (provider: "azure" | "google") => {
    const client = requireClient();
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const client = requireClient();
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/sign-in`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      configured: supabaseConfigured,
      signIn,
      signUp,
      signInWithProvider,
      resetPassword,
      signOut,
      refreshProfile: loadProfile,
    }),
    [session, profile, loading, signIn, signUp, signInWithProvider, resetPassword, signOut, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
