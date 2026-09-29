import { Minus, Plus } from "lucide-react";
import { cn } from "./cn";

interface Props {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  size?: "sm" | "md";
  label?: string;
  disabled?: boolean;
}

export function QuantityStepper({ value, min = 1, max, onChange, size = "md", label = "Quantidade", disabled }: Props) {
  const button = cn(
    "grid place-items-center rounded-full text-cocoa-900 transition-colors hover:bg-cream-200 disabled:opacity-30 disabled:hover:bg-transparent",
    size === "sm" ? "size-8" : "size-10",
  );
  return (
    <div
      className={cn("inline-flex items-center rounded-full border border-cream-300 bg-white", size === "sm" ? "gap-0.5 p-0.5" : "gap-1 p-1")}
      role="group"
      aria-label={label}
    >
      <button type="button" className={button} onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} aria-label="Diminuir quantidade">
        <Minus className="size-4" aria-hidden />
      </button>
      <span className={cn("min-w-8 text-center font-semibold tabular-nums", size === "sm" ? "text-sm" : "text-base")} aria-live="polite">
        {value}
      </span>
      <button type="button" className={button} onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label="Aumentar quantidade">
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
