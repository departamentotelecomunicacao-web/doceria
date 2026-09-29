import { useEffect, useRef } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { track } from "@/lib/analytics";
import { CartSync } from "@/store/CartSync";
import { ConsentBanner } from "./ConsentBanner";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function usePageView() {
  const location = useLocation();
  const last = useRef<string | null>(null);
  useEffect(() => {
    const path = location.pathname + location.search;
    if (last.current === path) return;
    last.current = path;
    track("page_view", { page_path: path });
  }, [location.pathname, location.search]);
}

export function StoreLayout() {
  usePageView();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Pular para o conteúdo
      </a>
      <Header />
      <CartSync />
      <main id="conteudo" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <ConsentBanner />
      <ScrollRestoration />
    </div>
  );
}
