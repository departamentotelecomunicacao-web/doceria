import { restSelect } from "@/lib/rest";
import type { Category, Product } from "@/types/domain";

export const PRODUCT_COLUMNS =
  "id,category_id,name,slug,short_description,description,price_cents,image_path,stock," +
  "is_active,is_featured,sort_order,created_at,updated_at";

export interface Catalog {
  categories: Category[];
  products: Product[];
}

/** Catálogo ativo (a RLS já esconde produtos e categorias inativos do público). */
export async function fetchCatalog(): Promise<Catalog> {
  const [categories, products] = await Promise.all([
    restSelect<Category>("categories", {
      select: "id,name,slug,sort_order,is_active",
      is_active: "eq.true",
      order: "sort_order.asc,name.asc",
    }),
    restSelect<Product>("products", { select: PRODUCT_COLUMNS, is_active: "eq.true", order: "sort_order.asc,name.asc" }),
  ]);
  return { categories, products };
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const rows = await restSelect<Product>("products", {
    select: PRODUCT_COLUMNS,
    slug: `eq.${slug}`,
    is_active: "eq.true",
    limit: "1",
  });
  return rows[0] ?? null;
}
