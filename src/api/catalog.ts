import { restSelect } from "@/lib/rest";
import type { Category, Product } from "@/types/domain";

const PRODUCT_COLUMNS =
  "id,category_id,name,slug,short_description,description,price_cents,compare_at_price_cents," +
  "stock_available,stock_reserved,low_stock_threshold,max_per_order,is_active,is_featured,sort_order," +
  "allergens,ingredients,weight_grams,created_at,updated_at," +
  "images:product_images(id,product_id,storage_path,thumb_path,alt_text,width,height,is_main,sort_order)";

export interface Catalog {
  categories: Category[];
  products: Product[];
}

function sortImages(product: Product): Product {
  const images = [...(product.images ?? [])].sort(
    (a, b) => Number(b.is_main) - Number(a.is_main) || a.sort_order - b.sort_order,
  );
  return { ...product, images };
}

/** Catálogo ativo (RLS já filtra produtos/categorias inativos para o público). */
export async function fetchCatalog(): Promise<Catalog> {
  const [categories, products] = await Promise.all([
    restSelect<Category>("categories", {
      select: "id,name,slug,description,sort_order,is_active",
      is_active: "eq.true",
      order: "sort_order.asc,name.asc",
    }),
    restSelect<Product>("products", { select: PRODUCT_COLUMNS, is_active: "eq.true", order: "sort_order.asc,name.asc" }),
  ]);
  return { categories, products: products.map(sortImages) };
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const rows = await restSelect<Product>("products", {
    select: PRODUCT_COLUMNS,
    slug: `eq.${slug}`,
    is_active: "eq.true",
    limit: "1",
  });
  return rows[0] ? sortImages(rows[0]) : null;
}
