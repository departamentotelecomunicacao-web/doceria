import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";
import { cn } from "./cn";

const tones: Record<Tone, string> = {
  neutral: "bg-cream-200 text-cocoa-800",
  success: "bg-sage-100 text-sage-700",
  warning: "bg-butter-200 text-caramel-700",
  danger: "bg-berry-100 text-berry-700",
  info: "bg-sky-100 text-sky-700",
  accent: "bg-caramel-600 text-white",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
