import { useEffect } from "react";

interface MetaOptions {
  title: string;
  description?: string;
  /** "noindex" para páginas transacionais (carrinho, checkout, pedido, admin, embed). */
  robots?: "index,follow" | "noindex,nofollow" | "noindex,follow";
  canonical?: string;
  image?: string | null;
  jsonLd?: Record<string, unknown> | null;
}

function upsertMeta(attr: "name" | "property", key: string, content: string | undefined) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function upsertLink(rel: string, href: string | undefined) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

export function useDocumentMeta(options: MetaOptions): void {
  const { title, description, robots = "index,follow", canonical, image, jsonLd } = options;
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", robots);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:image", image ?? undefined);
    upsertLink("canonical", canonical);

    let script = document.head.querySelector<HTMLScriptElement>("script[data-doceria-jsonld]");
    if (jsonLdText) {
      if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.dataset.doceriaJsonld = "true";
        document.head.appendChild(script);
      }
      script.textContent = jsonLdText;
    } else {
      script?.remove();
    }
  }, [title, description, robots, canonical, image, jsonLdText]);
}
