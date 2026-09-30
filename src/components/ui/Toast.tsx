import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (toast: Omit<ToastItem, "id">, durationMs?: number) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);

  const show = useCallback<ToastApi["show"]>((toast, durationMs = 4500) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((items) => [...items.slice(-3), { ...toast, id }]);
    window.setTimeout(() => dismiss(id), durationMs);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (title, description) => show({ tone: "success", title, description }),
    error: (title, description) => show({ tone: "error", title, description }, 7000),
    info: (title, description) => show({ tone: "info", title, description }),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-4 sm:items-end"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? TriangleAlert : Info;
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg",
                toast.tone === "error" ? "border-berry-600/30" : "border-cream-300",
              )}
            >
              <Icon
                className={cn("mt-0.5 size-5 shrink-0", toast.tone === "success" ? "text-sage-600" : toast.tone === "error" ? "text-berry-600" : "text-sky-700")}
                aria-hidden
              />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-cocoa-900">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-cocoa-600">{toast.description}</p>}
                {toast.action && (
                  <button type="button" className="mt-2 font-semibold text-caramel-700 underline underline-offset-2" onClick={toast.action.onClick}>
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button type="button" onClick={() => dismiss(toast.id)} className="rounded-full p-1 text-cocoa-500 hover:bg-cream-100" aria-label="Fechar aviso">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast precisa de ToastProvider");
  return context;
}
