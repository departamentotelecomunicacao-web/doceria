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
      <div className="container-page flex h-16 items-center justify-between gap-2 sm:gap-4">
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label={storeName ? `${storeName}, página inicial` : "Página inicial"}>
          <img src={`${import.meta.env.BASE_URL}marca/mascote.webp`} alt="" width={40} height={40} decoding="async"
            className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-black/5" />
          <span className="truncate font-display text-lg font-semibold tracking-tight text-cocoa-900 min-[380px]:text-xl">
            {storeName || <span className="skeleton inline-block h-5 w-24 rounded-md align-middle" />}
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1" aria-label="Principal">
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
