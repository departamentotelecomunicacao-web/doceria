import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, ClipboardList, Cookie, LayoutDashboard, LogOut, Menu, Settings, Users, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { ROLE_LABEL, useAdminAuth } from "@/admin/auth";
import { countActiveOrders } from "@/api/admin";
import { cn } from "@/components/ui/cn";
import { LoadingBlock } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/errors";
import { getAdminClient } from "@/lib/supabase";
import type { AppRole } from "@/types/domain";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  minRole: AppRole;
  mobile?: boolean;
}

const NAV: NavItem[] = [
  { to: "/admin/dashboard", label: "Início", icon: LayoutDashboard, minRole: "OPERATOR", mobile: true },
  { to: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, minRole: "OPERATOR", mobile: true },
  { to: "/admin/estoque", label: "Estoque", icon: Boxes, minRole: "OPERATOR", mobile: true },
  { to: "/admin/produtos", label: "Produtos", icon: Cookie, minRole: "OPERATOR", mobile: true },
  { to: "/admin/clientes", label: "Clientes", icon: Users, minRole: "ADMIN" },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings, minRole: "ADMIN" },
];

type RealtimeState = "connecting" | "live" | "offline";

/**
 * Pedidos novos chegam por Realtime; se o WebSocket falhar, o painel continua
 * funcionando por polling (a operação nunca depende só do WebSocket).
 */
function useOrderFeed(enabled: boolean) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [realtime, setRealtime] = useState<RealtimeState>("connecting");

  const pending = useQuery({
    queryKey: ["admin", "pending-count"],
    queryFn: countActiveOrders,
    enabled,
    refetchInterval: realtime === "live" ? 60_000 : 15_000,
  });

  // Fallback: detecta pedido novo pelo aumento da contagem.
  const lastPending = useRef<number | null>(null);
  useEffect(() => {
    const current = pending.data?.pending;
    if (current === undefined) return;
    if (lastPending.current !== null && current > lastPending.current && realtime !== "live") {
      toast.success("Novo pedido recebido", "Abra a central de pedidos para confirmar.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    }
    lastPending.current = current;
  }, [pending.data, realtime, toast, queryClient]);

  useEffect(() => {
    if (!enabled) return;
    const client = getAdminClient();
    const timeout = window.setTimeout(() => setRealtime((state) => (state === "live" ? state : "offline")), 10_000);
    const channel = client
      .channel("admin-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const code = (payload.new as { code?: string }).code;
        toast.success(`Novo pedido${code ? ` #${code}` : ""}`, "Abra a central de pedidos para confirmar.");
        void queryClient.invalidateQueries({ queryKey: ["admin"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "order"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "pending-count"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timeout);
          setRealtime("live");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          window.clearTimeout(timeout);
          setRealtime("offline");
        }
      });
    return () => {
      window.clearTimeout(timeout);
      void client.removeChannel(channel);
    };
  }, [enabled, queryClient, toast]);

  return { pendingCount: pending.data?.pending ?? 0, realtime };
}

/** Sessão expirada em qualquer chamada: volta ao login com aviso. */
function useSessionGuard() {
  const queryClient = useQueryClient();
  const { signOut, status } = useAdminAuth();
  useEffect(() => {
    const handle = (error: unknown) => {
      if (error instanceof ApiError && error.code === "AUTH_REQUIRED" && status === "ready") {
        void signOut("Sua sessão expirou. Entre novamente.");
      }
    };
    const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.state.status === "error") handle(event.query.state.error);
    });
    const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.mutation?.state.status === "error") handle(event.mutation.state.error);
    });
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [queryClient, signOut, status]);
}

export default function AdminLayout() {
  const auth = useAdminAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useSessionGuard();
  const { pendingCount, realtime } = useOrderFeed(auth.status === "ready");

  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (auth.status === "loading") return <LoadingBlock className="min-h-dvh" label="Carregando painel…" />;
  if (auth.status !== "ready" || !auth.profile) {
    const back = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?voltar=${back}`} replace state={{ reason: auth.signOutReason }} />;
  }

  const items = NAV.filter((item) => auth.hasRole(item.minRole));
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
      isActive ? "bg-cocoa-900 text-cream-50" : "text-cocoa-700 hover:bg-cream-200",
    );

  const badge = (item: NavItem) =>
    item.to === "/admin/pedidos" && pendingCount > 0 ? (
      <span className="ml-auto rounded-full bg-caramel-600 px-2 py-0.5 text-xs font-bold text-white" data-testid="pending-badge">{pendingCount}</span>
    ) : null;

  const connection = (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", realtime === "live" ? "text-sage-700" : "text-cocoa-500")} title={realtime === "live" ? "Atualização em tempo real" : "Atualizando a cada 15 segundos"}>
      {realtime === "live" ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
      {realtime === "live" ? "Tempo real" : "Atualização periódica"}
    </span>
  );

  return (
    <div className="min-h-dvh bg-cream-100 lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Barra lateral (desktop) */}
      <aside className="hidden border-r border-cream-200 bg-cream-50 lg:flex lg:h-dvh lg:flex-col lg:sticky lg:top-0">
        <div className="px-5 py-6">
          <Link to="/admin/dashboard" className="font-display text-xl">Painel</Link>
          <div className="mt-1">{connection}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Painel">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.icon className="size-5" />
              {item.label}
              {badge(item)}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-cream-200 p-4 text-sm">
          <div>
            <p className="font-semibold">{auth.profile.full_name || auth.profile.email}</p>
            <p className="text-cocoa-500">{ROLE_LABEL[auth.profile.role]}</p>
          </div>
          <div className="flex items-center justify-between">
            <Link to="/" className="text-cocoa-600 hover:text-cocoa-900">Ver loja</Link>
            <button type="button" onClick={() => auth.signOut()} className="inline-flex items-center gap-1.5 font-semibold text-cocoa-700 hover:text-berry-700">
              <LogOut className="size-4" aria-hidden /> Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-cream-200 bg-cream-50/95 px-4 backdrop-blur lg:hidden">
        <div>
          <p className="font-display text-lg leading-none">Painel</p>
          {connection}
        </div>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} className="rounded-full p-2 hover:bg-cream-200" aria-label="Menu" aria-expanded={menuOpen}>
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-x-0 top-14 z-30 space-y-1 border-b border-cream-200 bg-cream-50 p-3 shadow-lg lg:hidden">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.icon className="size-5" />
              {item.label}
              {badge(item)}
            </NavLink>
          ))}
          <div className="flex items-center justify-between px-3 pt-3 text-sm">
            <span className="text-cocoa-600">{auth.profile.full_name} · {ROLE_LABEL[auth.profile.role]}</span>
            <button type="button" onClick={() => auth.signOut()} className="font-semibold text-berry-700">Sair</button>
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <Outlet />
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-cream-200 bg-cream-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Atalhos">
        {items.filter((item) => item.mobile).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn("relative flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-semibold", isActive ? "text-cocoa-900" : "text-cocoa-500")}
          >
            <item.icon className="size-5" />
            {item.label}
            {item.to === "/admin/pedidos" && pendingCount > 0 && (
              <span className="absolute right-[22%] top-1.5 min-w-5 rounded-full bg-caramel-600 px-1.5 text-center text-[0.65rem] font-bold text-white">{pendingCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
