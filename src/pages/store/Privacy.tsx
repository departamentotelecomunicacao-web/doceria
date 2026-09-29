import { Button } from "@/components/ui/Button";
import { LoadingBlock } from "@/components/ui/States";
import { useStoreConfig } from "@/hooks/useStore";
import { getConsent, setConsent } from "@/lib/analytics";
import { hasAnalytics, storeUrl } from "@/lib/env";
import { useDocumentMeta } from "@/lib/seo";
import { useState, type ReactNode } from "react";

const UPDATED_AT = "29/09/2026";

function Block({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="space-y-3 leading-relaxed text-cocoa-700">{children}</div>
    </section>
  );
}

export default function Privacy() {
  const { data: config, isLoading } = useStoreConfig();
  const [consent, setConsentState] = useState(getConsent());
  useDocumentMeta({
    title: `Política de Privacidade e Cookies${config ? ` · ${config.storeName}` : ""}`,
    description: "Como tratamos seus dados pessoais (LGPD) e como usamos cookies.",
    canonical: storeUrl("/privacidade"),
  });
  if (isLoading || !config) return <LoadingBlock />;

  const controller = config.legalName || config.storeName;
  const contact = config.privacyContactEmail ?? config.contactEmail;

  return (
    <article className="container-page max-w-3xl space-y-10 py-10 sm:py-14">
      <header className="space-y-3">
        <p className="eyebrow">LGPD</p>
        <h1 className="font-display text-4xl sm:text-5xl">Política de Privacidade e Cookies</h1>
        <p className="text-sm text-cocoa-500">Última atualização: {UPDATED_AT}</p>
      </header>

      <Block title="Quem somos">
        <p>
          <strong>{controller}</strong> ({config.publicLocationLabel}) é a controladora dos dados pessoais tratados nesta loja online,
          nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
        </p>
        {contact && (
          <p>
            Canal para assuntos de dados pessoais: <a className="font-semibold underline" href={`mailto:${contact}`}>{contact}</a>.
          </p>
        )}
      </Block>

      <Block title="Quais dados coletamos e por quê">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Nome e telefone</strong>: identificar o pedido e falar com você sobre ele (confirmação, pagamento, entrega).</li>
          <li><strong>E-mail</strong> (opcional): contato alternativo sobre o pedido.</li>
          <li><strong>Endereço de entrega</strong> (somente para entregas): calcular a taxa pela rota real e realizar a entrega.</li>
          <li><strong>Histórico de pedidos</strong>: itens, valores, status e pagamentos, para operação, atendimento e obrigações legais.</li>
          <li>
            <strong>Dados técnicos</strong>: o endereço IP é transformado em um código irreversível (hash) apenas para limitar tentativas
            abusivas. Não guardamos o IP em texto.
          </li>
        </ul>
        <p>
          Bases legais: execução do contrato de compra (art. 7º, V), cumprimento de obrigação legal (art. 7º, II) e legítimo interesse
          para segurança e prevenção a fraudes (art. 7º, IX). Não vendemos nem usamos seus dados para outras finalidades.
        </p>
      </Block>

      <Block title="Com quem compartilhamos">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Supabase</strong>: hospedagem do banco de dados e do sistema de pedidos.</li>
          <li><strong>Google (Maps/Routes)</strong>: o endereço de entrega é enviado para calcular a distância da rota.</li>
          <li><strong>ViaCEP</strong>: o CEP digitado é consultado para preencher o endereço automaticamente.</li>
          <li><strong>WhatsApp</strong>: somente se você escolher enviar o pedido ou conversar por lá.</li>
        </ul>
        <p>Dados de clientes nunca aparecem em páginas públicas. O link do pedido é secreto e mostra o endereço parcialmente mascarado.</p>
      </Block>

      <Block title="Por quanto tempo guardamos">
        <p>
          Os registros de pedidos são mantidos pelo prazo exigido pela legislação fiscal e contábil (em geral, 5 anos). Depois disso, ou a
          seu pedido quando não houver obrigação legal de guarda, os dados pessoais são anonimizados.
        </p>
      </Block>

      <Block title="Seus direitos">
        <p>
          Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento e
          eliminação dos seus dados (art. 18 da LGPD){contact ? <> pelo e-mail <a className="font-semibold underline" href={`mailto:${contact}`}>{contact}</a></> : null}.
          Respondemos em até 15 dias.
        </p>
      </Block>

      <Block title="Segurança">
        <p>
          O acesso ao painel é restrito à equipe, com contas individuais e permissões por função. As regras de preço, estoque e acesso aos
          dados são aplicadas no servidor, com comunicação criptografada (HTTPS).
        </p>
      </Block>

      <Block id="cookies" title="Cookies e armazenamento local">
        <p>
          Usamos o armazenamento do navegador para funções essenciais: manter seu carrinho, o rascunho do checkout durante a sessão e suas
          preferências. Isso não exige consentimento, pois é necessário para a compra funcionar.
        </p>
        {hasAnalytics ? (
          <>
            <p>
              Ferramentas de medição (Google Analytics/Tag Manager e/ou Meta Pixel) só são carregadas se você aceitar. Você pode mudar a
              escolha a qualquer momento (ao recusar depois de aceitar, recarregue a página para desligar as ferramentas).
            </p>
            <p className="text-sm">Preferência atual: <strong>{consent === "granted" ? "aceito" : consent === "denied" ? "recusado" : "não definida"}</strong></p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { setConsent("granted"); setConsentState("granted"); }}>Aceitar medição</Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setConsent("denied");
                  setConsentState("denied");
                }}
              >
                Recusar medição
              </Button>
            </div>
          </>
        ) : (
          <p>Atualmente não usamos cookies de publicidade ou de medição de terceiros nesta loja.</p>
        )}
      </Block>
    </article>
  );
}
