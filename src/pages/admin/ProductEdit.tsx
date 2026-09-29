import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useAdminAuth } from "@/admin/auth";
import {
  deleteProduct,
  deleteProductImage,
  getAdminProduct,
  listAdminCategories,
  saveProduct,
  updateProductImage,
  uploadProductImage,
  type ProductInput,
} from "@/api/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { friendlyMessage } from "@/lib/errors";
import { compressImage, validateImageFile } from "@/lib/images";
import { centsToInput, parseBRLToCents } from "@/lib/money";
import { slugify } from "@/lib/slugify";
import { productImageUrl } from "@/lib/rest";
import type { Product, ProductImage } from "@/types/domain";

const COMMON_ALLERGENS = ["Glúten", "Leite", "Ovos", "Soja", "Castanhas", "Amendoim", "Avelã", "Pistache", "Nozes", "Amêndoas"];

interface FormState {
  name: string;
  slug: string;
  category_id: string;
  short_description: string;
  description: string;
  price: string;
  compareAt: string;
  initialStock: string;
  low_stock_threshold: string;
  max_per_order: string;
  sort_order: string;
  weight_grams: string;
  ingredients: string;
  allergens: string[];
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
    compareAt: centsToInput(product?.compare_at_price_cents),
    initialStock: "0",
    low_stock_threshold: String(product?.low_stock_threshold ?? 5),
    max_per_order: String(product?.max_per_order ?? 24),
    sort_order: String(product?.sort_order ?? 0),
    weight_grams: product?.weight_grams ? String(product.weight_grams) : "",
    ingredients: product?.ingredients ?? "",
    allergens: product?.allergens ?? [],
    is_active: product?.is_active ?? true,
    is_featured: product?.is_featured ?? false,
  };
}

function ImageManager({ product }: { product: Product }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "product", product.id] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    void queryClient.invalidateQueries({ queryKey: ["catalog"] });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let order = product.images.length;
    try {
      for (const file of Array.from(files)) {
        const invalid = validateImageFile(file);
        if (invalid) {
          toast.error(file.name, invalid);
          continue;
        }
        const full = await compressImage(file, 1600, 0.82);
        const thumb = await compressImage(file, 600, 0.8);
        await uploadProductImage(
          product.id,
          { full: full.blob, thumb: thumb.blob, extension: full.extension, contentType: full.contentType, width: full.width, height: full.height },
          product.name,
          order === 0,
          order,
        );
        order += 1;
      }
      toast.success("Imagens enviadas", "Revise o texto alternativo de cada foto.");
    } catch (error) {
      toast.error("Falha no envio", friendlyMessage(error));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      refresh();
    }
  };

  const update = useMutation({
    mutationFn: ({ image, patch }: { image: ProductImage; patch: Partial<Pick<ProductImage, "alt_text" | "is_main" | "sort_order">> }) => updateProductImage(image, patch),
    onSuccess: refresh,
    onError: (error) => toast.error("Não foi possível salvar", friendlyMessage(error)),
  });
  const remove = useMutation({
    mutationFn: deleteProductImage,
    onSuccess: () => {
      toast.success("Imagem removida");
      refresh();
    },
    onError: (error) => toast.error("Não foi possível remover", friendlyMessage(error)),
  });

  const move = (index: number, delta: number) => {
    const target = product.images[index + delta];
    const current = product.images[index];
    if (!target) return;
    update.mutate({ image: current, patch: { sort_order: target.sort_order } });
    update.mutate({ image: target, patch: { sort_order: current.sort_order } });
  };

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Fotos</h2>
          <p className="text-sm text-cocoa-600">Convertidas para WebP e redimensionadas no envio. A foto principal aparece no cardápio.</p>
        </div>
        <Button size="sm" variant="secondary" loading={uploading} icon={<ImagePlus className="size-4" />} onClick={() => inputRef.current?.click()}>
          Adicionar
        </Button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
      </div>
      {product.images.length === 0 ? (
        <Notice tone="info">Sem fotos ainda. A loja mostra uma ilustração no lugar. Fotos reais aumentam muito as vendas.</Notice>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {product.images.map((image, index) => (
            <li key={image.id} className={cn("space-y-2 rounded-2xl border p-3", image.is_main ? "border-cocoa-900" : "border-cream-200")}>
              <img src={productImageUrl(image.thumb_path ?? image.storage_path) ?? ""} alt={image.alt_text} className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
              <Input
                defaultValue={image.alt_text}
                aria-label="Texto alternativo"
                placeholder="Descreva a foto (acessibilidade)"
                onBlur={(e) => e.target.value !== image.alt_text && update.mutate({ image, patch: { alt_text: e.target.value.slice(0, 200) } })}
              />
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant={image.is_main ? "primary" : "ghost"} disabled={image.is_main} onClick={() => update.mutate({ image, patch: { is_main: true } })} icon={<Star className="size-4" />}>
                  {image.is_main ? "Principal" : "Tornar principal"}
                </Button>
                <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Mover para cima"><ArrowUp className="size-4" /></Button>
                <Button size="sm" variant="ghost" disabled={index === product.images.length - 1} onClick={() => move(index, 1)} aria-label="Mover para baixo"><ArrowDown className="size-4" /></Button>
                <Button size="sm" variant="ghost" className="text-berry-700" onClick={() => window.confirm("Remover esta foto?") && remove.mutate(image)} aria-label="Remover foto"><Trash2 className="size-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
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
  const [customAllergen, setCustomAllergen] = useState("");
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
    mutationFn: (input: ProductInput & { stock_available?: number }) => saveProduct(productId ?? null, input),
    onSuccess: (saved) => {
      toast.success(isNew ? "Produto criado" : "Produto salvo", isNew ? "Agora adicione as fotos." : undefined);
      queryClient.setQueryData(["admin", "product", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      if (isNew) navigate(`/admin/produtos/${saved.id}`, { replace: true });
    },
    onError: (error) => toast.error("Não foi possível salvar", friendlyMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => deleteProduct(productId!),
    onSuccess: () => {
      toast.success("Produto excluído");
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      navigate("/admin/produtos", { replace: true });
    },
    onError: (error) => toast.error("Não foi possível excluir", `${friendlyMessage(error)} Produtos com vendas não podem ser excluídos: desative-os.`),
  });

  if (!auth.hasRole("ADMIN")) return <Navigate to="/admin/produtos" replace />;
  if (!isNew && product.isLoading) return <LoadingBlock label="Carregando produto…" />;
  if (!isNew && (product.isError || !product.data)) {
    return <ErrorState error={product.error} onRetry={() => product.refetch()} title="Produto não encontrado" />;
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const price = parseBRLToCents(form.price);
    const compareAt = form.compareAt.trim() ? parseBRLToCents(form.compareAt) : null;
    const slug = form.slug || slugify(form.name);
    const initialStock = Number(form.initialStock || 0);
    if (form.name.trim().length < 2) nextErrors.name = "Informe o nome.";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) nextErrors.slug = "Use letras minúsculas, números e hífens.";
    if (!price || price <= 0) nextErrors.price = "Preço inválido.";
    if (form.compareAt.trim() && (compareAt === null || (price && compareAt <= price))) nextErrors.compareAt = "O preço \"de\" deve ser maior que o preço atual.";
    if (isNew && (!Number.isInteger(initialStock) || initialStock < 0)) nextErrors.initialStock = "Quantidade inválida.";
    if (!Number.isInteger(Number(form.max_per_order)) || Number(form.max_per_order) < 1) nextErrors.max_per_order = "Mínimo 1.";
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
      compare_at_price_cents: compareAt,
      low_stock_threshold: Math.max(0, Number(form.low_stock_threshold) || 0),
      max_per_order: Number(form.max_per_order),
      sort_order: Number(form.sort_order) || 0,
      weight_grams: form.weight_grams ? Number(form.weight_grams) : null,
      ingredients: form.ingredients.trim(),
      allergens: form.allergens,
      is_active: form.is_active,
      is_featured: form.is_featured,
      ...(isNew ? { stock_available: initialStock } : {}),
    });
  };

  const toggleAllergen = (allergen: string) =>
    set("allergens", form.allergens.includes(allergen) ? form.allergens.filter((item) => item !== allergen) : [...form.allergens, allergen]);

  return (
    <div className="space-y-6">
      <Link to="/admin/produtos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">
        <ArrowLeft className="size-4" aria-hidden /> Produtos
      </Link>
      <PageHeader title={isNew ? "Novo produto" : form.name || "Produto"} description={isNew ? undefined : "Estoque é alterado em Estoque (com motivo registrado)."} />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]" noValidate data-testid="product-form">
        <div className="space-y-6">
          <section className="card grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Nome" error={errors.name} className="sm:col-span-2">
              {({ id }) => <Input id={id} value={form.name} error={errors.name} maxLength={80}
                onChange={(e) => { set("name", e.target.value); if (isNew) set("slug", slugify(e.target.value)); }} />}
            </Field>
            <Field label="Endereço na loja" error={errors.slug} hint={`/produto/${form.slug || "…"}`}>
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={form.slug} error={errors.slug} onChange={(e) => set("slug", slugify(e.target.value))} />}
            </Field>
            <Field label="Categoria">
              {({ id }) => (
                <Select id={id} value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  <option value="">Sem categoria</option>
                  {(categories.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Resumo (cardápio)" className="sm:col-span-2" hint="Até 160 caracteres.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={form.short_description} maxLength={160} onChange={(e) => set("short_description", e.target.value)} />}
            </Field>
            <Field label="Descrição" optional className="sm:col-span-2">
              {({ id }) => <Textarea id={id} value={form.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} />}
            </Field>
          </section>

          <section className="card grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="font-display text-lg sm:col-span-2">Ingredientes e alergênicos</h2>
            <Field label="Ingredientes" optional className="sm:col-span-2">
              {({ id }) => <Textarea id={id} value={form.ingredients} maxLength={2000} onChange={(e) => set("ingredients", e.target.value)} />}
            </Field>
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-semibold text-cocoa-800">Alergênicos</p>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set([...COMMON_ALLERGENS, ...form.allergens])].map((allergen) => (
                  <button key={allergen} type="button" onClick={() => toggleAllergen(allergen)} aria-pressed={form.allergens.includes(allergen)}
                    className={cn("rounded-full border px-3 py-1 text-sm font-semibold", form.allergens.includes(allergen) ? "border-caramel-600 bg-butter-200 text-caramel-700" : "border-cream-300 text-cocoa-700")}>
                    {allergen}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={customAllergen} onChange={(e) => setCustomAllergen(e.target.value)} placeholder="Outro alergênico" className="max-w-56" />
                <Button size="sm" variant="secondary" disabled={!customAllergen.trim()} onClick={() => { toggleAllergen(customAllergen.trim()); setCustomAllergen(""); }}>Adicionar</Button>
              </div>
            </div>
            <Field label="Peso (g)" optional>
              {({ id }) => <Input id={id} type="number" min={1} value={form.weight_grams} onChange={(e) => set("weight_grams", e.target.value)} />}
            </Field>
          </section>

          {!isNew && product.data && <ImageManager product={product.data} />}
        </div>

        <div className="space-y-6">
          <section className="card grid gap-4 p-5">
            <h2 className="font-display text-lg">Preço</h2>
            <Field label="Preço (R$)" error={errors.price}>
              {({ id }) => <Input id={id} inputMode="decimal" value={form.price} error={errors.price} onChange={(e) => set("price", e.target.value)} placeholder="12,00" data-testid="product-price" />}
            </Field>
            <Field label="Preço “de” (R$)" optional error={errors.compareAt} hint="Mostrado riscado, para ofertas.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} inputMode="decimal" value={form.compareAt} error={errors.compareAt} onChange={(e) => set("compareAt", e.target.value)} />}
            </Field>
          </section>

          <section className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <h2 className="font-display text-lg sm:col-span-2 lg:col-span-1 xl:col-span-2">Estoque e exibição</h2>
            {isNew && (
              <Field label="Estoque inicial" error={errors.initialStock} hint="Registrado como entrada.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="number" min={0} value={form.initialStock} onChange={(e) => set("initialStock", e.target.value)} />}
              </Field>
            )}
            <Field label="Estoque mínimo">
              {({ id }) => <Input id={id} type="number" min={0} value={form.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} />}
            </Field>
            <Field label="Máximo por pedido" error={errors.max_per_order}>
              {({ id }) => <Input id={id} type="number" min={1} value={form.max_per_order} onChange={(e) => set("max_per_order", e.target.value)} />}
            </Field>
            <Field label="Ordem no cardápio">
              {({ id }) => <Input id={id} type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} />}
            </Field>
            <div className="space-y-3 sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <Checkbox checked={form.is_active} onChange={(value) => set("is_active", value)} label="Publicado na loja" description="Desmarque para ocultar sem excluir." />
              <Checkbox checked={form.is_featured} onChange={(value) => set("is_featured", value)} label="Destaque na página inicial" />
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg" loading={save.isPending} data-testid="save-product">{isNew ? "Criar produto" : "Salvar alterações"}</Button>
            {!isNew && (
              <Button variant="ghost" size="lg" className="text-berry-700" loading={remove.isPending}
                onClick={() => window.confirm("Excluir este produto definitivamente? Se ele já teve vendas, desative em vez de excluir.") && remove.mutate()}>
                Excluir
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
