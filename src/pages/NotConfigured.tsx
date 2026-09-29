export default function NotConfigured() {
  return (
    <div className="grid min-h-dvh place-items-center bg-cream-50 p-6">
      <div className="card max-w-lg space-y-3 p-6">
        <h1 className="font-display text-2xl">Loja em configuração</h1>
        <p className="text-cocoa-700">
          As variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> não foram definidas neste
          build. Configure-as (veja o README) e publique novamente.
        </p>
      </div>
    </div>
  );
}
