import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isConfigured } from "./env";
import { readStorage, safeAuthStorage } from "./storage";

// supabase-js é usado somente pelo painel (carregado sob demanda). A loja
// pública usa o cliente REST mínimo de ./rest.ts.

let adminClient: SupabaseClient | null = null;
let storedSessionAtStartup = false;

const ADMIN_STORAGE_KEY = "doceria-admin-auth";

/**
 * Havia sessão salva quando o painel abriu? Se havia e ela não pôde ser
 * renovada, a sessão expirou (e o painel avisa em vez de só mostrar o login).
 */
export function hadStoredAdminSession(): boolean {
  return storedSessionAtStartup;
}

// Cliente do painel: sessão persistida (chave própria), renovação automática.
export function getAdminClient(): SupabaseClient {
  if (!isConfigured) throw new Error("Supabase não configurado");
  if (!adminClient) {
    storedSessionAtStartup = Boolean(readStorage(ADMIN_STORAGE_KEY));
    adminClient = createClient(env.supabaseUrl, env.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: ADMIN_STORAGE_KEY,
        storage: safeAuthStorage,
      },
      global: { headers: { "x-client-info": "doceria-admin" } },
    });
  }
  return adminClient;
}
