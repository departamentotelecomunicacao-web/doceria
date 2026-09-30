import "@fontsource-variable/fraunces";
import "@fontsource-variable/manrope";
import "./styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { isConfigured } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import NotConfigured from "@/pages/NotConfigured";
import { router } from "@/router";
import { CartProvider } from "@/store/cart";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Não repetir erros de regra (4xx); repetir falhas de rede/servidor.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isConfigured ? (
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <CartProvider>
              <RouterProvider router={router} />
            </CartProvider>
          </ToastProvider>
        </QueryClientProvider>
      ) : (
        <NotConfigured />
      )}
    </ErrorBoundary>
  </StrictMode>,
);
