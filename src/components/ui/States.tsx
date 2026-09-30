import { AlertTriangle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { friendlyMessage } from "@/lib/errors";
import { Button } from "./Button";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}

export function LoadingBlock({ label = "Carregando…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-3 py-16 text-cocoa-600", className)} role="status" aria-live="polite">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-14 text-center", className)}>
      {icon && <div className="grid size-14 place-items-center rounded-full bg-cream-200 text-cocoa-700">{icon}</div>}
      <h3 className="font-display text-xl text-cocoa-900">{title}</h3>
      {description && <p className="max-w-sm text-sm text-cocoa-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  title = "Algo não saiu como esperado",
  onRetry,
  className,
}: {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-14 text-center", className)} role="alert">
      <div className="grid size-14 place-items-center rounded-full bg-berry-100 text-berry-700">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="font-display text-xl text-cocoa-900">{title}</h3>
      <p className="max-w-sm text-sm text-cocoa-600">{friendlyMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" />} onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-sky-700/15 bg-sky-100/70 text-sky-700",
    warning: "border-caramel-500/25 bg-butter-100 text-caramel-700",
    danger: "border-berry-600/20 bg-berry-100/70 text-berry-700",
    success: "border-sage-600/20 bg-sage-100 text-sage-700",
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4 text-sm", styles, className)} role={tone === "danger" ? "alert" : "status"}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-cocoa-800">{children}</div>}
      </div>
    </div>
  );
}
