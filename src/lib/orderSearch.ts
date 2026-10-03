// Busca de pedidos no painel: aceita "#NPWU2F", "npwu2f", nome ou WhatsApp
// com máscara. Devolve o termo limpo (sem # e sem caracteres que quebram o
// filtro do PostgREST) e as condições para o .or().

export interface OrderSearch {
  /** Termo limpo; vazio quando não há o que buscar. */
  term: string;
  /** Condições PostgREST para .or(...). */
  conditions: string[];
}

export function buildOrderSearch(raw: string): OrderSearch {
  const term = raw
    .normalize("NFC")
    .replace(/#/g, " ")
    .replace(/[^\p{L}\p{N}\s@.-]/gu, " ")
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!term) return { term: "", conditions: [] };

  const conditions = [`customer_name.ilike.%${term}%`];
  const code = term.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (code.length >= 2) conditions.push(`code.ilike.%${code}%`);
  const digits = term.replace(/\D/g, "");
  if (digits.length >= 4) conditions.push(`customer_phone.ilike.%${digits}%`);
  return { term, conditions };
}
