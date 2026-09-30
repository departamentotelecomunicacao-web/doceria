import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Star, Tags, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useAdminAuth } from "@/admin/auth";
import { deleteCategory, listAdminCategories, listAdminProducts, saveCategory, setProductStock } from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { ProductImage } from "@/components/store/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { friendlyMessage } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { slugify } from "@/lib/slugify";
import type { Category, Product } from "@/types/domain";

function CategoryManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: listAdminCategories, enabled: open });
  const [editing, setEditing] = useState<Partial<Category> | null>(null);

  const save = useMutation({
    mutationFn: (category: Partial<Category>) =>
      saveCategory(category.id ?? null, {
        name: category.name?.trim() ?? "",
        slug: category.slug || slugify(category.name ?? ""),
        sort_order: Number(category.sort_order ?? 0),
        is_active: category.is_active ?? true,
      }),
    onSuccess: () => {
      toast.success("Categoria salva");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error) => toast.error("Não foi possível salvar", friendlyMessage(error)),
  });
  const remove = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      toast.success("Categoria removida");
      void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
    onError: (error) => toast.error("Não foi possível remover", friendlyMessage(error)),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Categorias" description="Organizam o cardápio (ex.: Clássicos, Especiais, Caixas)." size="lg">
      <div className="space-y-4">
        <ul className="divide-y divide-cream-200">
          {(categories.data ?? []).map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <strong>{category.name}</strong> <span className="text-cocoa-500">· ordem {category.sort_order}</span>
                {!category.is_active && <Badge className="ml-2">oculta</Badge>}
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(category)} aria-label={`Editar ${category.name}`}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => window.confirm(`Remover a categoria ${category.name}? Os produtos ficam sem categoria.`) && remove.mutate(category.id)} aria-label={`Remover ${category.name}`}><Trash2 className="size-4" /></Button>
              </span>
            </li>
          ))}
        </ul>
        {editing ? (
          <div className="grid gap-3 rounded-2xl bg-cream-100 p-4 sm:grid-cols-2">
            <Field label="Nome">{({ id }) => <Input id={id} value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value, slug: editing.id ? editing.slug : slugify(e.target.value) })} />}</Field>
            <Field label="Ordem">{({ id }) => <Input id={id} type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />}</Field>
            <div className="sm:col-span-2"><Checkbox checked={editing.is_active ?? true} onChange={(value) => setEditing({ ...editing, is_active: value })} label="Aparece no cardápio" /></div>
            <div className="flex gap-2 sm:col-span-2">
              <Button size="sm" loading={save.isPending} disabled={(editing.name ?? "").trim().length < 1} onClick={() => save.mutate(editing)}>Salvar</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing({ is_active: true, sort_order: (categories.data?.length ?? 0) + 1 })}>Nova categoria</Button>
        )}
      </div>
    </Dialog>
  );
}

/** Disponível/esgotado e quantidade (vazio = sem limite). Atendente pode usar. */
function AvailabilityControl({ product }: { product: Product }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [stock, setStock] = useState(product.stock === null ? "" : String(product.stock));
  const parsed = stock.trim() === "" ? null : Number(stock);
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 0);
  const dirty = !invalid && parsed !== product.stock;

  const mutation = useMutation({
    mutationFn: ({ active, qty }: { active: boolean; qty: number | null }) => setProductStock(product.id, active, qty),
    onSuccess: () => {
      toast.success("Produto atualizado");
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error) => toast.error("Não foi possível salvar", friendlyMessage(error)),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => mutation.mutate({ active: !product.is_active, qty: product.stock })}
        disabled={mutation.isPending}
        className={cn(
          "h-9 rounded-full px-3 text-sm font-semibold",
          product.is_active ? "bg-sage-100 text-sage-700" : "bg-cream-200 text-cocoa-600",
        )}
        aria-pressed={product.is_active}
        data-testid="toggle-available"
      >
        {product.is_active ? "No cardápio" : "Fora do cardápio"}
      </button>
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-cocoa-600">Qtd.</span>
        <Input
          value={stock}
          onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          placeholder="sem limite"
          className="h-9 w-24"
          aria-label={`Quantidade de ${product.name}`}
          error={invalid ? "inválido" : undefined}
          data-testid="stock-input"
        />
      </label>
      {dirty && (
        <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate({ active: product.is_active, qty: parsed })} data-testid="save-stock">
          Salvar
        </Button>
      )}
    </div>
  );
}

export default function Products() {
  const auth = useAdminAuth();
  const isOwner = auth.hasRole("OWNER");
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: listAdminProducts });
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: listAdminCategories });
  const [search, setSearch] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);

  const categoryName = useMemo(() => new Map((categories.data ?? []).map((category) => [category.id, category.name])), [categories.data]);
  const rows = (products.data ?? []).filter((product) => !search.trim() || product.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Mudanças aparecem na loja e no cardápio do Wix na hora. Quantidade vazia = sem limite (feito sob encomenda)."
        actions={isOwner && (
          <>
            <Button variant="secondary" size="sm" icon={<Tags className="size-4" aria-hidden />} onClick={() => setCategoryOpen(true)}>Categorias</Button>
            <ButtonLink to="/admin/produtos/novo" size="sm" icon={<Plus className="size-4" aria-hidden />}>Novo produto</ButtonLink>
          </>
        )}
      />

      <label className="relative mb-4 block">
        <span className="sr-only">Buscar produto</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cocoa-400" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto" className="pl-9" />
      </label>

      {products.isError ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} title="Não foi possível carregar os produtos" />
      ) : products.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState title="Nenhum produto" description="Cadastre o primeiro produto do cardápio." action={isOwner && <ButtonLink to="/admin/produtos/novo">Novo produto</ButtonLink>} />
        </div>
      ) : (
        <ul className="card divide-y divide-cream-200">
          {rows.map((product) => (
            <li key={product.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4" data-testid="admin-product-row" data-product-slug={product.slug}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-cream-100"><ProductImage product={product} /></span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {product.name}
                    {product.is_featured && <Star className="ml-1.5 inline size-4 fill-butter-300 text-caramel-500" aria-label="Destaque" />}
                  </p>
                  <p className="text-sm text-cocoa-600">
                    <span className="font-semibold tabular-nums text-cocoa-900">{formatBRL(product.price_cents)}</span>
                    {" · "}{categoryName.get(product.category_id ?? "") ?? "Sem categoria"}
                    {product.stock === 0 && <span className="text-berry-700"> · esgotado</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AvailabilityControl key={`${product.id}-${product.stock}-${product.is_active}`} product={product} />
                {isOwner && (
                  <ButtonLink to={`/admin/produtos/${product.id}`} size="sm" variant="secondary" icon={<Pencil className="size-4" aria-hidden />}>Editar</ButtonLink>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <CategoryManager open={categoryOpen} onClose={() => setCategoryOpen(false)} />
    </div>
  );
}
