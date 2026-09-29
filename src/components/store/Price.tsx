import { cn } from "@/components/ui/cn";
import { formatBRL } from "@/lib/money";

export function Price({ cents, compareAtCents, className, size = "md" }: { cents: number; compareAtCents?: number | null; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("whitespace-nowrap font-bold tabular-nums text-cocoa-900", size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base")}>
        {formatBRL(cents)}
      </span>
      {compareAtCents && compareAtCents > cents && (
        <s className="whitespace-nowrap text-xs tabular-nums text-cocoa-500 sm:text-sm" aria-label={`Antes ${formatBRL(compareAtCents)}`}>
          {formatBRL(compareAtCents)}
        </s>
      )}
    </span>
  );
}
