import { cn } from "@/components/ui/cn";
import type { Category } from "@/types/domain";

interface Props {
  categories: Category[];
  active: string;
  onChange: (slug: string) => void;
  counts?: Record<string, number>;
}

/** Filtro por categoria ("Todos" + categorias ativas do banco). */
export function CategoryTabs({ categories, active, onChange, counts }: Props) {
  const tabs = [{ slug: "todos", name: "Todos" }, ...categories.map((c) => ({ slug: c.slug, name: c.name }))];
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0" role="tablist" aria-label="Categorias">
      <div className="flex w-max gap-2">
        {tabs.map((tab) => {
          const selected = tab.slug === active;
          return (
            <button
              key={tab.slug}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.slug)}
              className={cn(
                "h-10 rounded-full border px-4 text-sm font-semibold transition-colors",
                selected ? "border-cocoa-900 bg-cocoa-900 text-cream-50" : "border-cream-300 bg-white text-cocoa-800 hover:border-cocoa-400",
              )}
            >
              {tab.name}
              {counts && counts[tab.slug] !== undefined && (
                <span className={cn("ml-1.5 tabular-nums", selected ? "text-cream-200" : "text-cocoa-500")}>{counts[tab.slug]}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
