import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { productImageUrl } from "@/lib/rest";
import type { Product } from "@/types/domain";
import { CookieIllustration } from "./CookieIllustration";

interface Props {
  product: Pick<Product, "id" | "name" | "image_path">;
  className?: string;
  priority?: boolean;
}

/** Foto do produto (Supabase Storage) com lazy loading; sem foto, ilustração. */
export function ProductImage({ product, className, priority }: Props) {
  const [failed, setFailed] = useState(false);
  const url = productImageUrl(product.image_path);

  if (!url || failed) {
    return <CookieIllustration seed={product.id} name={product.name} className={cn("h-full w-full", className)} />;
  }
  return (
    <img
      src={url}
      alt={product.name}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
