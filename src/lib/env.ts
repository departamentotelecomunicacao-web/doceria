// Variáveis públicas do frontend (Vite). Somente valores seguros para o navegador.

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

const siteUrl = clean(import.meta.env.VITE_SITE_URL).replace(/\/$/, "");

export const env = {
  supabaseUrl: clean(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, ""),
  supabaseKey: clean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  /** URL pública da loja (sem barra final). */
  siteUrl: siteUrl || (typeof window !== "undefined" ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}` : ""),
  basePath: import.meta.env.BASE_URL,
  gtmId: clean(import.meta.env.VITE_GTM_ID),
  ga4Id: clean(import.meta.env.VITE_GA4_ID),
  metaPixelId: clean(import.meta.env.VITE_META_PIXEL_ID),
  embedParentOrigins: clean(import.meta.env.VITE_EMBED_PARENT_ORIGINS)
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
} as const;

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseKey);

export const hasAnalytics = Boolean(env.gtmId || env.ga4Id || env.metaPixelId);

/** Monta uma URL absoluta da loja para um caminho interno (ex.: "/produto/x"). */
export function storeUrl(path: string): string {
  return `${env.siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
