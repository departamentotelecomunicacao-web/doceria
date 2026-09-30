import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { RouteFallback } from "@/components/RouteFallback";
import { StoreLayout } from "@/components/store/StoreLayout";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/store/Home";
import Products from "@/pages/store/Products";

// Loja pública carregada de imediato; checkout, pedido, embed e painel sob
// demanda (bundle inicial menor no celular).
const routes: RouteObject[] = [
  {
    path: "/embed",
    lazy: async () => ({ Component: (await import("@/pages/embed/Embed")).default }),
  },
  {
    // Painel: provedor de autenticação próprio e proteção contra iframe.
    path: "/admin",
    lazy: async () => ({ Component: (await import("@/pages/admin/AdminRoot")).default }),
    children: [
      { path: "login", lazy: async () => ({ Component: (await import("@/pages/admin/Login")).default }) },
      {
        lazy: async () => ({ Component: (await import("@/pages/admin/AdminLayout")).default }),
        children: [
          { index: true, element: <Navigate to="/admin/pedidos" replace /> },
          { path: "pedidos", lazy: async () => ({ Component: (await import("@/pages/admin/Orders")).default }) },
          { path: "pedidos/:orderId", lazy: async () => ({ Component: (await import("@/pages/admin/OrderDetail")).default }) },
          { path: "produtos", lazy: async () => ({ Component: (await import("@/pages/admin/Products")).default }) },
          { path: "produtos/novo", lazy: async () => ({ Component: (await import("@/pages/admin/ProductEdit")).default }) },
          { path: "produtos/:productId", lazy: async () => ({ Component: (await import("@/pages/admin/ProductEdit")).default }) },
          { path: "configuracoes", lazy: async () => ({ Component: (await import("@/pages/admin/Settings")).default }) },
          { path: "*", element: <Navigate to="/admin/pedidos" replace /> },
        ],
      },
    ],
  },
  {
    path: "/",
    element: <StoreLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "produtos", element: <Products /> },
      { path: "produto/:slug", lazy: async () => ({ Component: (await import("@/pages/store/ProductDetail")).default }) },
      { path: "carrinho", lazy: async () => ({ Component: (await import("@/pages/store/Cart")).default }) },
      { path: "checkout", lazy: async () => ({ Component: (await import("@/pages/store/Checkout")).default }) },
      { path: "pedido/:publicToken", lazy: async () => ({ Component: (await import("@/pages/store/OrderStatus")).default }) },
      { path: "privacidade", lazy: async () => ({ Component: (await import("@/pages/store/Privacy")).default }) },
      { path: "*", element: <NotFound /> },
    ],
  },
];

function withFallback(list: RouteObject[]): RouteObject[] {
  return list.map((route) => ({
    ...route,
    ...(route.lazy ? { HydrateFallback: RouteFallback } : {}),
    ...(route.children ? { children: withFallback(route.children) } : {}),
  })) as RouteObject[];
}

export const router = createBrowserRouter(withFallback(routes), {
  basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
});
