// POST /functions/v1/admin-users
// Gestão da equipe (somente o dono/a dona): listar, criar conta individual,
// alterar papel/ativação e redefinir senha. Cada pessoa tem sua própria conta.

import { type AppRole, requireStaff, type StaffProfile } from "../_shared/auth.ts";
import { AuthApiError, Db, dbConfigFromEnv } from "../_shared/db.ts";
import { AppError } from "../_shared/errors.ts";
import { createHandler, jsonResponse, readJsonBody } from "../_shared/http.ts";

const getEnv = (name: string) => Deno.env.get(name);
const db = new Db(dbConfigFromEnv(getEnv));

const ROLES: readonly AppRole[] = ["OWNER", "STAFF"];
type Role = AppRole;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = "876000h";

type Profile = StaffProfile;

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 10 || password.length > 72 ||
    !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError(400, "WEAK_PASSWORD", "A senha precisa ter ao menos 10 caracteres, com letras e números.");
  }
  return password;
}

async function activeOwnerCount(excludingId: string): Promise<number> {
  const rows = await db.select<{ id: string }>(
    "profiles",
    `select=id&role=eq.OWNER&is_active=eq.true&id=neq.${excludingId}`,
  );
  return rows.length;
}

Deno.serve(createHandler(getEnv, "admin-users", async (req, cors) => {
  const actor = await requireStaff(db, req, "OWNER");
  const body = (await readJsonBody(req, 4096)) as Record<string, unknown>;
  const action = body?.action;

  if (action === "list") {
    const [profiles, auth] = await Promise.all([
      db.select<Profile>("profiles", "select=*&order=created_at.asc"),
      db.adminListUsers(),
    ]);
    const lastSignIn = new Map(auth.users.map((user) => [user.id, user.last_sign_in_at]));
    return jsonResponse({
      members: profiles.map((profile) => ({
        id: profile.id,
        fullName: profile.full_name,
        email: profile.email,
        role: profile.role,
        isActive: profile.is_active,
        createdAt: profile.created_at,
        lastSignInAt: lastSignIn.get(profile.id) ?? null,
        isSelf: profile.id === actor.id,
      })),
    }, 200, cors);
  }

  if (action === "create") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!EMAIL_RE.test(email) || email.length > 254) throw new AppError(400, "INVALID_EMAIL", "E-mail inválido.");
    if (fullName.length < 2 || fullName.length > 120) throw new AppError(400, "INVALID_NAME", "Informe o nome.");
    if (!isRole(body.role)) throw new AppError(400, "INVALID_ROLE", "Papel inválido.");
    const password = validatePassword(body.password);

    let created: { id: string; email: string };
    try {
      created = await db.adminCreateUser({ email, password, fullName });
    } catch (error) {
      if (error instanceof AuthApiError && (error.status === 422 || error.code === "email_exists")) {
        throw new AppError(409, "EMAIL_IN_USE", "Já existe uma conta com este e-mail.");
      }
      if (error instanceof AuthApiError && error.code === "weak_password") {
        throw new AppError(400, "WEAK_PASSWORD", "A senha precisa ter ao menos 10 caracteres, com letras e números.");
      }
      throw error;
    }

    await db.insert("profiles", { id: created.id, full_name: fullName, email, role: body.role, is_active: true });
    return jsonResponse({ id: created.id }, 201, cors);
  }

  if (action === "update") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!UUID_RE.test(userId)) throw new AppError(400, "INVALID_USER", "Usuário inválido.");
    const rows = await db.select<Profile>("profiles", `select=*&id=eq.${userId}`);
    if (rows.length === 0) throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
    const target = rows[0];

    const patch: Record<string, unknown> = {};
    if (body.role !== undefined) {
      if (!isRole(body.role)) throw new AppError(400, "INVALID_ROLE", "Papel inválido.");
      patch.role = body.role;
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") throw new AppError(400, "INVALID_STATUS", "Status inválido.");
      patch.is_active = body.isActive;
    }
    if (body.fullName !== undefined) {
      const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
      if (fullName.length < 2 || fullName.length > 120) throw new AppError(400, "INVALID_NAME", "Informe o nome.");
      patch.full_name = fullName;
    }
    if (Object.keys(patch).length === 0) throw new AppError(400, "NO_CHANGES", "Nada para alterar.");

    // Nunca deixar a loja sem um proprietário ativo.
    const losesOwner = target.role === "OWNER" && target.is_active &&
      ((patch.role !== undefined && patch.role !== "OWNER") || patch.is_active === false);
    if (losesOwner && (await activeOwnerCount(target.id)) === 0) {
      throw new AppError(409, "LAST_OWNER", "É preciso manter ao menos um dono ou dona ativo.");
    }

    await db.update("profiles", `id=eq.${target.id}`, patch);
    if (patch.is_active !== undefined) {
      await db.adminUpdateUser(target.id, { ban_duration: patch.is_active ? "none" : BAN_FOREVER });
    }
    return jsonResponse({ id: target.id }, 200, cors);
  }

  if (action === "reset-password") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!UUID_RE.test(userId)) throw new AppError(400, "INVALID_USER", "Usuário inválido.");
    const password = validatePassword(body.password);
    const rows = await db.select<Profile>("profiles", `select=id,full_name,email&id=eq.${userId}`);
    if (rows.length === 0) throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
    await db.adminUpdateUser(userId, { password });
    return jsonResponse({ id: userId }, 200, cors);
  }

  throw new AppError(400, "INVALID_ACTION", "Ação inválida.");
}));
