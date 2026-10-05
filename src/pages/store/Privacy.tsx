import type { ReactNode } from "react";
import { LoadingBlock } from "@/components/ui/States";
import { useStoreConfig } from "@/hooks/useStore";
import { storeUrl } from "@/lib/env";
import { useDocumentMeta } from "@/lib/seo";
import { whatsappLink } from "@/lib/whatsapp";
import { formatBrazilPhone } from "@shared/validation.ts";

const UPDATED_AT = "30/09/2026";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="space-y-3 leading-relaxed text-cocoa-700">{children}</div>
    </section>
  );
}

export default function Privacy() {
  const { data: config, isLoading } = useStoreConfig();
  useDocumentMeta({
    title: `Privacidade${config ? ` · ${config.storeName}` : ""}`,
    description: "Como tratamos seus dados pessoais (LGPD).",
    canonical: storeUrl("/privacidade"),
  });
  if (isLoading || !config) return <LoadingBlock />;

  const whatsapp = whatsappLink(config.whatsappPhone);

  return (
    <article className="container-page max-w-3xl space-y-10 py-10 sm:py-14">
      <header className="space-y-3">
        <p className="eyebrow">LGPD</p>
        <h1 className="font-display text-4xl sm:text-5xl">Privacidade</h1>
        <p className="text-sm text-cocoa-500">Última atualização: {UPDATED_AT}</p>
      </header>

      <Block title="Quem somos">
        <p>
          <strong>{config.storeName}</strong> ({config.deliveryCity}) é responsável pelos dados pessoais usados nesta loja,
          conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
        </p>
        {whatsapp && (
          <p>
            Fale com a gente sobre seus dados pelo WhatsApp{" "}
            <a className="font-semibold underline" href={whatsapp} target="_blank" rel="noopener">{formatBrazilPhone(config.whatsappPhone)}</a>.
          </p>
        )}
      </Block>

      <Block title="Quais dados usamos e por quê">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Nome e WhatsApp</strong>: identificar o pedido, confirmar e avisar você sobre o andamento.</li>
          <li><strong>Endereço</strong> (só para entrega): levar o pedido até você.</li>
          <li><strong>Pedido</strong>: itens, valores, data e pagamento, para produzir, entregar e cumprir obrigações legais.</li>
          <li>
            <strong>Dados técnicos</strong>: o endereço IP vira um código irreversível apenas para limitar tentativas
            abusivas de pedido. Não guardamos o IP em si.
          </li>
        </ul>
        <p>Não pedimos e-mail, CPF, data de nascimento nem senha. Não há cadastro de cliente.</p>
      </Block>

      <Block title="Com quem compartilhamos">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Supabase</strong>: banco de dados onde os pedidos ficam guardados.</li>
          <li><strong>WhatsApp</strong>: canal da confirmação e dos avisos do pedido, quando você envia o pedido ou a loja responde.</li>
        </ul>
        <p>Não vendemos nem cedemos seus dados para publicidade.</p>
      </Block>

      <Block title="Armazenamento no seu aparelho">
        <p>
          Guardamos no navegador apenas o carrinho e os dados que você digitou no checkout, para não se perderem se a
          página recarregar. Não usamos cookies de publicidade nem de rastreamento.
        </p>
      </Block>

      <Block title="Por quanto tempo e seus direitos">
        <p>
          Os pedidos ficam guardados pelo prazo exigido pela legislação fiscal e de consumo. Você pode pedir acesso,
          correção ou exclusão dos seus dados (quando a lei permitir) pelo nosso WhatsApp.
        </p>
      </Block>
    </article>
  );
}
