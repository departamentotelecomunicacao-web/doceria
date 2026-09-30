import { ButtonLink } from "@/components/ui/Button";
import { useDocumentMeta } from "@/lib/seo";

export default function NotFound() {
  useDocumentMeta({ title: "Página não encontrada", robots: "noindex,nofollow" });
  return (
    <section className="container-page grid min-h-[60dvh] place-items-center py-16 text-center">
      <div className="max-w-md space-y-4">
        <p className="eyebrow">Erro 404</p>
        <h1 className="font-display text-4xl text-cocoa-900">Essa página saiu do forno antes da hora</h1>
        <p className="text-cocoa-600">O endereço pode ter mudado. Que tal voltar ao cardápio?</p>
        <ButtonLink to="/produtos" size="lg">Ver cardápio</ButtonLink>
      </div>
    </section>
  );
}
