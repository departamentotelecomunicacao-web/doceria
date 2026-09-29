import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
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
          { index: true, element: <Navigate to="/admin/dashboard" replace /> },
          { path: "dashboard", lazy: async () => ({ Component: (await import("@/pages/admin/Dashboard")).default }) },
          { path: "pedidos", lazy: async () => ({ Component: (await import("@/pages/admin/Orders")).default }) },
          { path: "pedidos/novo", lazy: async () => ({ Component: (await import("@/pages/admin/NewOrder")).default }) },
          { path: "pedidos/:orderId", lazy: async () => ({ Component: (await import("@/pages/admin/OrderDetail")).default }) },
          { path: "produtos", lazy: async () => ({ Component: (await import("@/pages/admin/Products")).default }) },
          { path: "produtos/novo", lazy: async () => ({ Component: (await import("@/pages/admin/ProductEdit")).default }) },
          { path: "produtos/:productId", lazy: async () => ({ Component: (await import("@/pages/admin/ProductEdit")).default }) },
          { path: "estoque", lazy: async () => ({ Component: (await import("@/pages/admin/Inventory")).default }) },
          { path: "clientes", lazy: async () => ({ Component: (await import("@/pages/admin/Customers")).default }) },
          { path: "configuracoes", lazy: async () => ({ Component: (await import("@/pages/admin/Settings")).default }) },
          { path: "*", element: <Navigate to="/admin/dashboard" replace /> },
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
      { path: "cookies", element: <Navigate to="/privacidade#cookies" replace /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
});
