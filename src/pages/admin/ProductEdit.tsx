import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useAdminAuth } from "@/admin/auth";
import {
  deleteProduct,
  getAdminProduct,
  listAdminCategories,
  removeProductPhoto,
  saveProduct,
  uploadProductPhoto,
} from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { ProductImage } from "@/components/store/ProductImage";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { friendlyMessage } from "@/lib/errors";
import { compressImage, validateImageFile } from "@/lib/images";
import { centsToInput, parseBRLToCents } from "@/lib/money";
import { slugify } from "@/lib/slugify";
import type { Product } from "@/types/domain";

interface FormState {
  name: string;
  slug: string;
  category_id: string;
  short_description: string;
  description: string;
  price: string;
  stock: string;
  sort_order: string;
  is_active: boolean;
  is_featured: boolean;
}

function fromProduct(product: Product | null): FormState {
  return {
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    category_id: product?.category_id ?? "",
    short_description: product?.short_description ?? "",
    description: product?.description ?? "",
    price: centsToInput(product?.price_cents),
    stock: product?.stock === null || product?.stock === undefined ? "" : String(product.stock),
    sort_order: String(product?.sort_order ?? 0),
    is_active: product?.is_active ?? true,
    is_featured: product?.is_featured ?? false,
  };
}

function PhotoManager({ product }: { product: Product }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "product", product.id] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    void queryClient.invalidateQueries({ queryKey: ["catalog"] });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      toast.error("Foto não aceita", invalid);
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImage(file, 1400, 0.82);
      await uploadProductPhoto(product, { blob: compressed.blob, extension: compressed.extension, contentType: compressed.contentType });
      toast.success("Foto atualizada");
    } catch (error) {
      toast.error("Falha no envio", friendlyMessage(error));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      refresh();
    }
  };

  const remove = useMutation({
    mutationFn: () => removeProductPhoto(product),
    onSuccess: () => { toast.success("Foto removida"); refresh(); },
    onError: (error) => toast.error("Não foi possível remover", friendlyMessage(error)),
  });

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg">Foto</h2>
        <p className="text-sm text-cocoa-600">Redimensionada e otimizada no envio. Prefira foto quadrada, com luz natural.</p>
      </div>
      <div className="aspect-square max-w-64 overflow-hidden rounded-2xl bg-cream-100">
        <ProductImage product={product} />
      </div>
      {!product.image_path && <Notice tone="info">Sem foto, a loja mostra uma ilustração. Fotos reais vendem mais.</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={uploading} icon={<ImagePlus className="size-4" />} onClick={() => inputRef.current?.click()} data-testid="upload-photo">
          {product.image_path ? "Trocar foto" : "Enviar foto"}
        </Button>
        {product.image_path && (
          <Button size="sm" variant="ghost" className="text-berry-700" loading={remove.isPending} icon={<Trash2 className="size-4" />}
            onClick={() => window.confirm("Remover a foto?") && remove.mutate()}>
            Remover
          </Button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
    </section>
  );
}

export default function ProductEdit() {
  const { productId } = useParams();
  const isNew = !productId;
  const auth = useAdminAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const product = useQuery({ queryKey: ["admin", "product", productId], queryFn: () => getAdminProduct(productId!), enabled: !isNew });
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: listAdminCategories });
  const [form, setForm] = useState<FormState>(() => fromProduct(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (product.data && loadedId.current !== product.data.id) {
      loadedId.current = product.data.id;
      setForm(fromProduct(product.data));
    }
  }, [product.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const save = useMutation({
    mutationFn: (input: Parameters<typeof saveProduct>[1]) => saveProduct(productId ?? null, input),
    onSuccess: (saved) => {
      toast.success(isNew ? "Produto criado" : "Produto salvo", isNew ? "Agora envie a foto." : undefined);
      queryClient.setQueryData(["admin", "product", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      if (isNew) navigate(`/admin/produtos/${saved.id}`, { replace: true });
    },
    onError: (error) => toast.error("Não foi possível salvar", friendlyMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => deleteProduct(product.data!),
    onSuccess: () => {
      toast.success("Produto excluído");
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      navigate("/admin/produtos", { replace: true });
    },
    onError: (error) => toast.error("Não foi possível excluir", friendlyMessage(error)),
  });

  if (!auth.hasRole("OWNER")) return <Navigate to="/admin/produtos" replace />;
  if (!isNew && product.isLoading) return <LoadingBlock label="Carregando produto…" />;
  if (!isNew && (product.isError || !product.data)) {
    return <ErrorState error={product.error} onRetry={() => product.refetch()} title="Produto não encontrado" />;
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const price = parseBRLToCents(form.price);
    const slug = form.slug || slugify(form.name);
    const stock = form.stock.trim() === "" ? null : Number(form.stock);
    if (form.name.trim().length < 2) nextErrors.name = "Informe o nome.";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) nextErrors.slug = "Use letras minúsculas, números e hífens.";
    if (!price || price <= 0) nextErrors.price = "Preço inválido.";
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) nextErrors.stock = "Quantidade inválida.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    save.mutate({
      name: form.name.trim(),
      slug,
      category_id: form.category_id || null,
      short_description: form.short_description.trim(),
      description: form.description.trim(),
      price_cents: price!,
      stock,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
      is_featured: form.is_featured,
    });
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/produtos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">
        <ArrowLeft className="size-4" aria-hidden /> Produtos
      </Link>
      <PageHeader title={isNew ? "Novo produto" : form.name || "Produto"} />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]" noValidate data-testid="product-form">
        <div className="space-y-6">
          <section className="card grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Nome" error={errors.name} className="sm:col-span-2">
              {({ id }) => <Input id={id} value={form.name} error={errors.name} maxLength={80}
                onChange={(e) => { set("name", e.target.value); if (isNew) set("slug", slugify(e.target.value)); }} data-testid="product-name" />}
            </Field>
            <Field label="Categoria">
              {({ id }) => (
                <Select id={id} value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  <option value="">Sem categoria</option>
                  {(categories.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Endereço na loja" error={errors.slug} hint={`/produto/${form.slug || "…"}`}>
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={form.slug} error={errors.slug} onChange={(e) => set("slug", slugify(e.target.value))} />}
            </Field>
            <Field label="Resumo (aparece no cardápio)" className="sm:col-span-2" hint="Até 160 caracteres.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={form.short_description} maxLength={160} onChange={(e) => set("short_description", e.target.value)} />}
            </Field>
            <Field label="Descrição completa" optional className="sm:col-span-2" hint="Sabor, recheio, tamanho, alergênicos.">
              {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={form.description} maxLength={2000} onChange={(e) => set("description", e.target.value)} />}
            </Field>
          </section>

          {!isNew && product.data && <PhotoManager product={product.data} />}
        </div>

        <div className="space-y-6">
          <section className="card grid gap-4 p-5">
            <Field label="Preço (R$)" error={errors.price}>
              {({ id }) => <Input id={id} inputMode="decimal" value={form.price} error={errors.price} onChange={(e) => set("price", e.target.value)} placeholder="12,00" data-testid="product-price" />}
            </Field>
            <Field label="Quantidade disponível" optional error={errors.stock} hint="Deixe vazio se for feito sob encomenda (sem limite).">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} inputMode="numeric" value={form.stock} error={errors.stock}
                onChange={(e) => set("stock", e.target.value.replace(/[^\d]/g, ""))} placeholder="sem limite" />}
            </Field>
            <Field label="Ordem no cardápio" hint="Menor aparece primeiro.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} />}
            </Field>
            <Checkbox checked={form.is_active} onChange={(value) => set("is_active", value)} label="Aparece no cardápio" description="Desmarque para esconder sem excluir." />
            <Checkbox checked={form.is_featured} onChange={(value) => set("is_featured", value)} label="Destaque na página inicial" />
          </section>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg" loading={save.isPending} data-testid="save-product">{isNew ? "Criar produto" : "Salvar alterações"}</Button>
            {!isNew && (
              <Button variant="ghost" size="lg" className="text-berry-700" loading={remove.isPending}
                onClick={() => window.confirm("Excluir este produto? Os pedidos antigos continuam com o nome e o preço registrados.") && remove.mutate()}>
                Excluir
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
