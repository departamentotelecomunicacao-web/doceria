import { AtSign, MapPin, MessageCircle } from "lucide-react";
import { InstagramIcon } from "@/components/store/InstagramIcon";
import { Link } from "react-router";
import { useStoreConfig } from "@/hooks/useStore";
import { summarizeWeeklyHours } from "@/lib/datetime";
import { formatBrazilPhone } from "@shared/validation.ts";
import { whatsappLink } from "@/lib/whatsapp";

export function Footer() {
  const { data: config } = useStoreConfig();
  if (!config) return <footer className="mt-24 h-40 border-t border-cream-200" />;

  const whatsapp = whatsappLink(config.whatsappNumber);
  const hours = summarizeWeeklyHours(config.businessHours);

  return (
    <footer className="mt-24 bg-cocoa-900 text-cream-200">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="font-display text-2xl text-cream-50">{config.storeName}</p>
          {config.tagline && <p className="text-sm text-cream-300">{config.tagline}</p>}
          <p className="flex items-center gap-2 text-sm text-cream-300">
            <MapPin className="size-4" aria-hidden /> {config.publicLocationLabel}
          </p>
        </div>

        <div className="space-y-3">
          <p className="eyebrow !text-caramel-300">Contato</p>
          <ul className="space-y-2 text-sm">
            {whatsapp && (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-cream-50">
                  <MessageCircle className="size-4" aria-hidden /> {formatBrazilPhone(`+${config.whatsappNumber}`)}
                </a>
              </li>
            )}
            {config.instagramHandle && (
              <li>
                <a href={`https://instagram.com/${config.instagramHandle}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-cream-50">
                  <InstagramIcon className="size-4" /> @{config.instagramHandle}
                </a>
              </li>
            )}
            {config.contactEmail && (
              <li>
                <a href={`mailto:${config.contactEmail}`} className="inline-flex items-center gap-2 hover:text-cream-50">
                  <AtSign className="size-4" aria-hidden /> {config.contactEmail}
                </a>
              </li>
            )}
          </ul>
        </div>

        <div className="space-y-3">
          <p className="eyebrow !text-caramel-300">Horários</p>
          <dl className="space-y-1.5 text-sm">
            {hours.map((row) => (
              <div key={row.days} className="flex justify-between gap-4">
                <dt className="text-cream-300">{row.days}</dt>
                <dd className="tabular-nums">{row.hours}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-3">
          <p className="eyebrow !text-caramel-300">Informações</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/produtos" className="hover:text-cream-50">Cardápio completo</Link></li>
            {config.wixSiteUrl && <li><a href={config.wixSiteUrl} className="hover:text-cream-50">Site institucional</a></li>}
            <li><Link to="/privacidade" className="hover:text-cream-50">Política de privacidade e cookies</Link></li>
            <li><Link to="/admin" className="text-cream-300/70 hover:text-cream-50">Acesso da equipe</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-cream-50/10">
        <p className="container-page py-5 text-xs text-cream-300/80">
          © {new Date().getFullYear()} {config.legalName || config.storeName}. Preços e disponibilidade atualizados em tempo real.
        </p>
      </div>
    </footer>
  );
}
