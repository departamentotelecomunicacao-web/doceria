import { LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { SignInError, useAdminAuth } from "@/admin/auth";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { LoadingBlock, Notice } from "@/components/ui/States";

export default function Login() {
  const auth = useAdminAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = params.get("voltar")?.startsWith("/admin") ? params.get("voltar")! : "/admin/dashboard";
  const reason = auth.signOutReason ?? (location.state as { reason?: string } | null)?.reason ?? null;

  if (auth.status === "loading" && !submitting) return <LoadingBlock className="min-h-dvh" label="Verificando sessão…" />;
  if (auth.status === "ready") return <Navigate to={redirectTo} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setSubmitting(true);
    try {
      await auth.signIn(email, password);
    } catch (err) {
      setError(err instanceof SignInError ? err.message : "Não foi possível entrar agora. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-cream-100 px-4 py-10">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-5 p-6 sm:p-8" noValidate data-testid="login-form">
        <div className="space-y-2 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-cocoa-900 text-caramel-300">
            <LockKeyhole className="size-6" aria-hidden />
          </span>
          <h1 className="font-display text-2xl">Painel da loja</h1>
          <p className="text-sm text-cocoa-600">Acesso restrito à equipe. Cada pessoa usa a própria conta.</p>
        </div>

        {reason && <Notice tone="warning">{reason}</Notice>}
        {auth.status === "no-access" && (
          <Notice tone="danger" title="Conta sem acesso ao painel">
            Peça ao proprietário da loja para liberar seu acesso.
            <button type="button" className="mt-2 block font-semibold underline" onClick={() => auth.signOut()}>Sair desta conta</button>
          </Notice>
        )}
        {error && <Notice tone="danger">{error}</Notice>}

        <Field label="E-mail">
          {({ id }) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}
        </Field>
        <Field label="Senha">
          {({ id }) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
        </Field>
        <Button type="submit" size="lg" block loading={submitting}>Entrar</Button>
        <p className="text-center text-xs text-cocoa-500">Esqueceu a senha? Peça a um proprietário para redefini-la em Configurações › Equipe.</p>
      </form>
    </div>
  );
}
