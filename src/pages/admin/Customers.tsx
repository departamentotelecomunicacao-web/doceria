import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageCircle, Search, UserX, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { useAdminAuth } from "@/admin/auth";
import { anonymizeCustomer, listCustomers, type CustomerRow } from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/datetime";
import { friendlyMessage } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { whatsappLink } from "@/lib/whatsapp";
import { formatBrazilPhone } from "@shared/validation.ts";

const PAGE_SIZE = 30;

export default function Customers() {
  const auth = useAdminAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [toAnonymize, setToAnonymize] = useState<CustomerRow | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ["admin", "customers", debounced, page],
    queryFn: () => listCustomers(debounced, PAGE_SIZE, page * PAGE_SIZE),
    placeholderData: keepPreviousData,
    enabled: auth.hasRole("ADMIN"),
  });

  const anonymize = useMutation({
    mutationFn: (customer: CustomerRow) => anonymizeCustomer(customer.id),
    onSuccess: () => {
      toast.success("Dados anonimizados", "Pedidos e valores foram mantidos para fins contábeis.");
      setToAnonymize(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (error) => toast.error("Não foi possível anonimizar", friendlyMessage(error)),
  });

  if (!auth.hasRole("ADMIN")) return <Navigate to="/admin/dashboard" replace />;
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Clientes não têm login: são identificados pelo telefone informado no pedido. Mantemos só o necessário (LGPD)."
      />
      <label className="relative mb-4 block">
        <span className="sr-only">Buscar cliente</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cocoa-400" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone ou e-mail" className="pl-9" />
      </label>

      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Não foi possível carregar os clientes" />
      ) : !query.data ? (
        <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : query.data.items.length === 0 ? (
        <div className="card"><EmptyState icon={<Users className="size-6" aria-hidden />} title="Nenhum cliente encontrado" /></div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm" data-testid="customers-table">
              <thead className="border-b border-cream-200 bg-cream-50 text-cocoa-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Telefone</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 text-right font-semibold">Pedidos</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor total</th>
                  <th className="px-4 py-3 font-semibold">Último pedido</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {query.data.items.map((customer) => {
                  const wa = whatsappLink(customer.phone?.replace(/\D/g, ""));
                  return (
                    <tr key={customer.id}>
                      <td className="px-4 py-3 font-semibold">
                        {customer.name}
                        {customer.anonymized && <Badge className="ml-2">anonimizado</Badge>}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {customer.phone ? (
                          <span className="inline-flex items-center gap-2">
                            {formatBrazilPhone(customer.phone)}
                            {wa && <a href={wa} target="_blank" rel="noopener" aria-label="WhatsApp" className="text-sage-700"><MessageCircle className="size-4" /></a>}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 text-cocoa-700">{customer.email ?? "-"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {customer.phone ? (
                          <Link to={`/admin/pedidos?status=todos&q=${encodeURIComponent(customer.phone.replace(/\D/g, "").slice(-8))}`} className="underline">{customer.ordersCount}</Link>
                        ) : customer.ordersCount}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatBRL(customer.totalSpentCents)}</td>
                      <td className="px-4 py-3 text-cocoa-700">{customer.lastOrderAt ? formatDateTime(customer.lastOrderAt) : "-"}</td>
                      <td className="px-4 py-3 text-right">
                        {auth.hasRole("OWNER") && !customer.anonymized && (
                          <Button size="sm" variant="ghost" onClick={() => setToAnonymize(customer)} aria-label={`Anonimizar ${customer.name}`} title="Anonimizar (LGPD)">
                            <UserX className="size-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-cocoa-600">
            <span>{total} {total === 1 ? "cliente" : "clientes"}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button>
              <span className="tabular-nums">{page + 1} / {pages}</span>
              <Button variant="secondary" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        </>
      )}

      <Dialog
        open={toAnonymize !== null}
        onClose={() => setToAnonymize(null)}
        title="Anonimizar cliente"
        description="Use quando o titular pedir a exclusão dos dados (LGPD). Nome, telefone, e-mail e endereços serão removidos; pedidos e valores ficam para a contabilidade. Não é possível desfazer."
        footer={
          <>
            <Button variant="secondary" onClick={() => setToAnonymize(null)}>Voltar</Button>
            <Button variant="danger" loading={anonymize.isPending} onClick={() => toAnonymize && anonymize.mutate(toAnonymize)}>Anonimizar</Button>
          </>
        }
      >
        {toAnonymize && <p className="text-sm">Cliente: <strong>{toAnonymize.name}</strong> ({toAnonymize.ordersCount} pedidos)</p>}
      </Dialog>
      <p className="mt-6 text-xs text-cocoa-500">
        Exportações e contatos devem respeitar a finalidade da coleta (atendimento dos pedidos). <Link to="/privacidade" className="underline">Política de privacidade</Link>
      </p>
    </div>
  );
}
