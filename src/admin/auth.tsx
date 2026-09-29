import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAdminClient } from "@/lib/supabase";
import type { AppRole } from "@/types/domain";

export interface StaffProfile {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  is_active: boolean;
}

type AuthStatus = "loading" | "signed-out" | "no-access" | "ready";

interface AdminAuthValue {
  status: AuthStatus;
  session: Session | null;
  profile: StaffProfile | null;
  /** Motivo do último logout forçado (ex.: sessão expirada). */
  signOutReason: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (reason?: string) => Promise<void>;
  hasRole: (min: AppRole) => boolean;
}

const RANK: Record<AppRole, number> = { OPERATOR: 1, ADMIN: 2, OWNER: 3 };
const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export class SignInError extends Error {}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const client = getAdminClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [signOutReason, setSignOutReason] = useState<string | null>(null);
  const manualSignOut = useRef(false);

  const loadProfile = useCallback(async (current: Session | null) => {
    if (!current) {
      setProfile(null);
      setStatus("signed-out");
      return;
    }
    const { data, error } = await client
      .from("profiles")
      .select("id,full_name,email,role,is_active")
      .eq("id", current.user.id)
      .maybeSingle();
    if (error) {
      // Falha de rede: mantém a sessão e tenta de novo depois.
      setStatus((previous) => (previous === "ready" ? "ready" : "loading"));
      return;
    }
    if (!data || !data.is_active) {
      setProfile(null);
      setStatus("no-access");
      return;
    }
    setProfile(data as StaffProfile);
    setStatus("ready");
  }, [client]);

  useEffect(() => {
    let mounted = true;
    client.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      void loadProfile(data.session);
    });
    const { data: listener } = client.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "SIGNED_OUT") {
        if (!manualSignOut.current) setSignOutReason("Sua sessão expirou. Entre novamente.");
        manualSignOut.current = false;
        setProfile(null);
        setStatus("signed-out");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        // Evita chamar o banco dentro do callback (recomendação do supabase-js).
        window.setTimeout(() => void loadProfile(next), 0);
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [client, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    setSignOutReason(null);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) throw new SignInError("E-mail ou senha incorretos.");
      if (/banned/i.test(error.message)) throw new SignInError("Esta conta foi desativada. Fale com o proprietário da loja.");
      if (/rate|too many/i.test(error.message)) throw new SignInError("Muitas tentativas. Aguarde alguns minutos.");
      if (/fetch|network/i.test(error.message)) throw new SignInError("Sem conexão com o servidor. Verifique a internet.");
      throw new SignInError("Não foi possível entrar agora. Tente novamente.");
    }
  }, [client]);

  const signOut = useCallback(async (reason?: string) => {
    manualSignOut.current = !reason;
    setSignOutReason(reason ?? null);
    await client.auth.signOut({ scope: "local" });
    setSession(null);
    setProfile(null);
    setStatus("signed-out");
  }, [client]);

  const hasRole = useCallback((min: AppRole) => Boolean(profile && RANK[profile.role] >= RANK[min]), [profile]);

  const value = useMemo(
    () => ({ status, session, profile, signOutReason, signIn, signOut, hasRole }),
    [status, session, profile, signOutReason, signIn, signOut, hasRole],
  );
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth precisa de AdminAuthProvider");
  return context;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  OWNER: "Proprietário(a)",
  ADMIN: "Administrador(a)",
  OPERATOR: "Operador(a)",
};
