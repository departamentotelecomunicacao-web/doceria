// Confere o login da equipe nas Edge Functions: JWT válido + profile ativo.

import type { Db } from "./db.ts";
import { AppError } from "./errors.ts";

export type AppRole = "OWNER" | "STAFF";

export interface StaffProfile {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
}

export async function requireStaff(db: Db, req: Request, role?: AppRole): Promise<StaffProfile> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || !jwt.includes(".")) {
    throw new AppError(401, "AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.");
  }
  const user = await db.getUserFromJwt(jwt);
  if (!user) throw new AppError(401, "AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.");

  const rows = await db.select<StaffProfile>("profiles", `select=*&id=eq.${user.id}&is_active=eq.true`);
  if (rows.length === 0) throw new AppError(403, "FORBIDDEN", "Você não tem acesso ao painel.");
  if (role === "OWNER" && rows[0].role !== "OWNER") {
    throw new AppError(403, "FORBIDDEN", "Somente o dono ou a dona da loja pode fazer isso.");
  }
  return rows[0];
}
