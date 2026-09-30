import { ShoppingBag } from "lucide-react";
import { Link, NavLink } from "react-router";
import { cn } from "@/components/ui/cn";
import { useStoreConfig } from "@/hooks/useStore";
import { useCartDetails } from "@/store/useCartDetails";

export function Header() {
  const config = useStoreConfig();
  const { cart, reconciled } = useCartDetails();
  const count = reconciled?.count ?? cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  const storeName = config.data?.storeName ?? "";

  const navLink = ({ isActive }: { isActive: boolean }) =>
    cn("rounded-full px-3 py-2 text-sm font-semibold transition-colors", isActive ? "text-cocoa-900" : "text-cocoa-600 hover:text-cocoa-900");

  return (
    <header className="sticky top-0 z-40 border-b border-cream-200/80 bg-cream-50/90 backdrop-blur supports-[backdrop-filter]:bg-cream-50/75">
      {config.data && !config.data.acceptingOrders && (
        <div className="bg-cocoa-900 px-4 py-2 text-center text-sm text-cream-100" role="status">
          {config.data.pauseMessage || "No momento não estamos recebendo pedidos. Volte em breve!"}
        </div>
      )}
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label={storeName ? `${storeName}, página inicial` : "Página inicial"}>
          <span className="grid size-9 place-items-center rounded-xl bg-cocoa-900 text-caramel-400" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
              <path d="M12 3c5 0 9 3.7 9 8.6 0 5-3.8 9.4-9.2 9.4C6.7 21 3 17.3 3 12.3 3 7.3 6.9 3 12 3Z" />
              <g fill="#2A1B12"><circle cx="9" cy="9" r="1.3" /><circle cx="14.5" cy="8.2" r="1" /><circle cx="15.8" cy="13" r="1.4" /><circle cx="10.4" cy="14.6" r="1.1" /></g>
            </svg>
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-cocoa-900">
            {storeName || <span className="skeleton inline-block h-5 w-24 rounded-md align-middle" />}
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Principal">
          <NavLink to="/produtos" className={navLink}>
            Cardápio
          </NavLink>
          {config.data?.institutionalUrl && (
            <a href={config.data.institutionalUrl} className="hidden rounded-full px-3 py-2 text-sm font-semibold text-cocoa-600 hover:text-cocoa-900 sm:inline-flex">
              Nosso site
            </a>
          )}
          <Link
            to="/carrinho"
            className="relative ml-1 inline-flex h-10 items-center gap-2 rounded-full bg-cocoa-900 pl-3.5 pr-4 text-sm font-semibold text-cream-50 hover:bg-cocoa-800"
            aria-label={`Carrinho, ${count} ${count === 1 ? "item" : "itens"}`}
            data-testid="cart-button"
          >
            <ShoppingBag className="size-4" aria-hidden />
            <span className="tabular-nums" data-testid="cart-count">{count}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
