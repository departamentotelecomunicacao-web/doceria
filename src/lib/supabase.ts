import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isConfigured } from "./env";
import { safeAuthStorage } from "./storage";

// supabase-js é usado somente pelo painel (carregado sob demanda). A loja
// pública usa o cliente REST mínimo de ./rest.ts.

let adminClient: SupabaseClient | null = null;

// Cliente do painel: sessão persistida (chave própria), renovação automática.
export function getAdminClient(): SupabaseClient {
  if (!isConfigured) throw new Error("Supabase não configurado");
  if (!adminClient) {
    adminClient = createClient(env.supabaseUrl, env.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "doceria-admin-auth",
        storage: safeAuthStorage,
      },
      global: { headers: { "x-client-info": "doceria-admin" } },
    });
  }
  return adminClient;
}
