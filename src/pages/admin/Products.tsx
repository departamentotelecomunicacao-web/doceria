import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Search, Star, Tags, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAdminAuth } from "@/admin/auth";
import { deleteCategory, listAdminCategories, listAdminProducts, saveCategory, saveProduct } from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { ProductImage } from "@/components/store/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { friendlyMessage } from "@/lib/errors";
import { stockStatusOf } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import type { Category, Product } from "@/types/domain";
import { slugify } from "@/lib/slugify";

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
        description: category.description ?? "",
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
    <Dialog open={open} onClose={onClose} title="Categorias" description="Organizam o cardápio (ex.: Clássicos, Especiais, Combos, Novidades)." size="lg">
      <div className="space-y-4">
        <ul className="divide-y divide-cream-200">
          {(categories.data ?? []).map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <strong>{category.name}</strong> <span className="text-cocoa-500">/{category.slug} · ordem {category.sort_order}</span>
                {!category.is_active && <Badge className="ml-2">inativa</Badge>}
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
            <Field label="Endereço (slug)">{({ id }) => <Input id={id} value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} />}</Field>
            <Field label="Descrição" optional className="sm:col-span-2">{({ id }) => <Input id={id} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={300} />}</Field>
            <Field label="Ordem">{({ id }) => <Input id={id} type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />}</Field>
            <div className="flex items-end"><Checkbox checked={editing.is_active ?? true} onChange={(value) => setEditing({ ...editing, is_active: value })} label="Ativa" /></div>
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

export default function Products() {
  const auth = useAdminAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canEdit = auth.hasRole("ADMIN");
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: listAdminProducts });
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: listAdminCategories });
  const [search, setSearch] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);

  const toggle = useMutation({
    mutationFn: ({ product, patch }: { product: Product; patch: Partial<Product> }) => {
      const { images: _images, id, created_at: _c, updated_at: _u, stock_available: _s, stock_reserved: _r, ...rest } = { ...product, ...patch };
      return saveProduct(id, rest);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error) => toast.error("Não foi possível salvar", friendlyMessage(error)),
  });

  const categoryName = useMemo(() => new Map((categories.data ?? []).map((category) => [category.id, category.name])), [categories.data]);
  const rows = (products.data ?? []).filter((product) => !search.trim() || product.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Alterações de preço e disponibilidade aparecem na loja e no cardápio do Wix na hora, sem novo deploy."
        actions={canEdit && (
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
        <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState title="Nenhum produto" description="Cadastre o primeiro produto do cardápio." action={canEdit && <ButtonLink to="/admin/produtos/novo">Novo produto</ButtonLink>} />
        </div>
      ) : (
        <ul className="card divide-y divide-cream-200">
          {rows.map((product) => {
            const status = stockStatusOf(product);
            return (
              <li key={product.id} className="flex items-center gap-3 p-3 sm:p-4" data-testid="admin-product-row" data-product-slug={product.slug}>
                <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-cream-100"><ProductImage product={product} sizes="56px" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {product.name}
                    {product.is_featured && <Star className="ml-1.5 inline size-4 fill-butter-300 text-caramel-500" aria-label="Destaque" />}
                  </p>
                  <p className="text-sm text-cocoa-600">
                    <span className="font-semibold text-cocoa-900 tabular-nums">{formatBRL(product.price_cents)}</span>
                    {" · "}{categoryName.get(product.category_id ?? "") ?? "Sem categoria"}
                    {" · "}<span className={status === "SOLD_OUT" ? "text-berry-700" : status === "LOW" ? "text-caramel-700" : ""}>{product.stock_available} em estoque</span>
                  </p>
                </div>
                {!product.is_active && <Badge>Inativo</Badge>}
                {canEdit && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ product, patch: { is_active: !product.is_active } })}
                      aria-label={product.is_active ? `Ocultar ${product.name}` : `Publicar ${product.name}`} title={product.is_active ? "Ocultar da loja" : "Publicar na loja"}>
                      {product.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>
                    <ButtonLink to={`/admin/produtos/${product.id}`} size="sm" variant="secondary" icon={<Pencil className="size-4" aria-hidden />}>Editar</ButtonLink>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!canEdit && <p className="mt-4 text-sm text-cocoa-600">Seu papel permite consultar produtos. Para editar, fale com um administrador.</p>}
      <CategoryManager open={categoryOpen} onClose={() => setCategoryOpen(false)} />
    </div>
  );
}


