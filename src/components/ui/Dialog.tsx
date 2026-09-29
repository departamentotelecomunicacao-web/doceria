import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

/**
 * Diálogo acessível com <dialog> nativo (foco preso, ESC fecha). No celular
 * vira uma folha que sobe da borda inferior.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={cn(
        "m-0 mt-auto w-full max-w-none rounded-t-3xl bg-white p-0 text-cocoa-900 shadow-2xl backdrop:bg-cocoa-950/40 backdrop:backdrop-blur-[2px]",
        "sm:m-auto sm:rounded-3xl",
        size === "sm" && "sm:max-w-md",
        size === "md" && "sm:max-w-lg",
        size === "lg" && "sm:max-w-2xl",
      )}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      {open && (
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4">
            <div>
              <h2 id="dialog-title" className="font-display text-xl">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-cocoa-600">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-cocoa-600 hover:bg-cream-100" aria-label="Fechar">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-cream-200 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
