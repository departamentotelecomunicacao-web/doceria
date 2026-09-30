import { Outlet, ScrollRestoration } from "react-router";
import { CartSync } from "@/store/CartSync";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function StoreLayout() {
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
      <ScrollRestoration />
    </div>
  );
}
