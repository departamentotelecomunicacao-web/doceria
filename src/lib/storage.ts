// Acesso seguro a localStorage/sessionStorage: em iframes de terceiros,
// navegação privada ou com bloqueio de cookies o acesso pode lançar exceção.

type Area = "local" | "session";

function area(kind: Area): Storage | null {
  try {
    const storage = kind === "local" ? window.localStorage : window.sessionStorage;
    const probe = "__doceria_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

const memory = new Map<string, string>();

export function readStorage(key: string, kind: Area = "local"): string | null {
  const storage = area(kind);
  try {
    return storage ? storage.getItem(key) : memory.get(`${kind}:${key}`) ?? null;
  } catch {
    return memory.get(`${kind}:${key}`) ?? null;
  }
}

export function writeStorage(key: string, value: string, kind: Area = "local"): void {
  const storage = area(kind);
  try {
    if (storage) storage.setItem(key, value);
    else memory.set(`${kind}:${key}`, value);
  } catch {
    memory.set(`${kind}:${key}`, value);
  }
}

export function removeStorage(key: string, kind: Area = "local"): void {
  const storage = area(kind);
  try {
    storage?.removeItem(key);
  } catch {
    // ignorado
  }
  memory.delete(`${kind}:${key}`);
}

export function readJson<T>(key: string, fallback: T, kind: Area = "local"): T {
  const raw = readStorage(key, kind);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, kind: Area = "local"): void {
  writeStorage(key, JSON.stringify(value), kind);
}

/** Adaptador para o supabase-js (sessão do painel). */
export const safeAuthStorage = {
  getItem: (key: string) => readStorage(key, "local"),
  setItem: (key: string, value: string) => writeStorage(key, value, "local"),
  removeItem: (key: string) => removeStorage(key, "local"),
};
