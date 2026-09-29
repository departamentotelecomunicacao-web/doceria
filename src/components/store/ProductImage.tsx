import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { productImageUrl } from "@/lib/rest";
import type { Product } from "@/types/domain";
import { CookieIllustration } from "./CookieIllustration";

interface Props {
  product: Pick<Product, "id" | "name" | "images">;
  className?: string;
  sizes?: string;
  priority?: boolean;
  index?: number;
}

/** Foto do produto (Supabase Storage) com srcset, lazy loading e alt text. */
export function ProductImage({ product, className, sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw", priority, index = 0 }: Props) {
  const image = product.images?.[index];
  const [failed, setFailed] = useState(false);
  const full = productImageUrl(image?.storage_path);
  const thumb = productImageUrl(image?.thumb_path);

  if (!image || !full || failed) {
    return <CookieIllustration seed={product.id} name={product.name} className={cn("h-full w-full", className)} />;
  }

  const srcSet = thumb ? `${thumb} 600w, ${full} ${image.width ?? 1600}w` : undefined;
  return (
    <img
      src={full}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={image.alt_text || product.name}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
