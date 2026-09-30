// Ponte entre o /embed (dentro do iframe do Wix) e a página pai.
// Mensagens não carregam dados pessoais. Nada depende do domínio pai: se não
// houver ninguém ouvindo, as mensagens são simplesmente ignoradas.
import { env } from "./env";

export type EmbedEventType = "READY" | "RESIZE" | "PRODUCT_VIEW" | "ADD_TO_CART" | "OPEN_STORE" | "BEGIN_CHECKOUT";

export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function postToParent(type: EmbedEventType, payload?: Record<string, unknown>, extra?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !isEmbedded()) return;
  const message = { source: "doceria-embed", type, payload: payload ?? null, ...extra };
  const origins = env.embedParentOrigins.length > 0 ? env.embedParentOrigins : ["*"];
  for (const origin of origins) {
    try {
      window.parent.postMessage(message, origin);
    } catch {
      // origem diferente da configurada: ignorado
    }
  }
}

/** Informa a altura do conteúdo para o pai ajustar o iframe (quando suportado). */
export function startAutoResize(element: HTMLElement): () => void {
  let lastHeight = 0;
  let frame = 0;
  const report = () => {
    frame = 0;
    const height = Math.ceil(element.getBoundingClientRect().height);
    if (Math.abs(height - lastHeight) >= 2) {
      lastHeight = height;
      postToParent("RESIZE", undefined, { height });
    }
  };
  const observer = new ResizeObserver(() => {
    if (!frame) frame = requestAnimationFrame(report);
  });
  observer.observe(element);
  report();
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}
