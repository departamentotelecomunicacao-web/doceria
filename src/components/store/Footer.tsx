import { Bike, MapPin, MessageCircle, Store } from "lucide-react";
import { Link } from "react-router";
import { InstagramIcon } from "@/components/store/InstagramIcon";
import { useStoreConfig } from "@/hooks/useStore";
import { formatBRL } from "@/lib/money";
import { whatsappLink } from "@/lib/whatsapp";
import { formatBrazilPhone } from "@shared/validation.ts";

export function Footer() {
  const { data: config } = useStoreConfig();
  if (!config) return <footer className="mt-24 h-40 border-t border-cream-200" />;

  const whatsapp = whatsappLink(config.whatsappPhone);
  const instagramHandle = config.instagramUrl?.replace(/\/$/, "").split("/").pop();

  return (
    <footer className="mt-24 bg-cocoa-900 text-cream-200">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3">
          <p className="font-display text-2xl text-cream-50">{config.storeName}</p>
          {config.tagline && <p className="text-sm text-cream-300">{config.tagline}</p>}
          <p className="flex items-center gap-2 text-sm text-cream-300">
            <MapPin className="size-4" aria-hidden /> {config.deliveryCity}
          </p>
        </div>

        <div className="space-y-3">
          <p className="eyebrow !text-caramel-300">Como receber</p>
          <ul className="space-y-2 text-sm">
            {config.deliveryEnabled && (
              <li className="flex items-center gap-2">
                <Bike className="size-4" aria-hidden /> Entrega: {formatBRL(config.deliveryFeeCents)}
              </li>
            )}
            {config.pickupEnabled && (
              <li className="flex items-center gap-2">
                <Store className="size-4" aria-hidden /> Retirada: grátis
              </li>
            )}
            {whatsapp && (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-cream-50">
                  <MessageCircle className="size-4" aria-hidden /> {formatBrazilPhone(config.whatsappPhone)}
                </a>
              </li>
            )}
            {config.instagramUrl && (
              <li>
                <a href={config.instagramUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-cream-50">
                  <InstagramIcon className="size-4" /> @{instagramHandle}
                </a>
              </li>
            )}
          </ul>
        </div>

        <div className="space-y-3">
          <p className="eyebrow !text-caramel-300">Informações</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/produtos" className="hover:text-cream-50">Cardápio completo</Link></li>
            {config.institutionalUrl && <li><a href={config.institutionalUrl} className="hover:text-cream-50">Nosso site</a></li>}
            <li><Link to="/privacidade" className="hover:text-cream-50">Privacidade</Link></li>
            <li><Link to="/admin" className="text-cream-300/70 hover:text-cream-50">Acesso da equipe</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-cream-50/10">
        <p className="container-page py-5 text-xs text-cream-300/80">
          © {new Date().getFullYear()} {config.storeName}. Preços e disponibilidade atualizados em tempo real.
        </p>
      </div>
    </footer>
  );
}
