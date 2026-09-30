// Tipagem mínima do runtime Deno usada pelas Edge Functions, para que o
// `tsc` do projeto também verifique os entrypoints (o runtime real é o
// Supabase Edge Runtime / Deno).
declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
    toObject(): Record<string, string>;
  }
  const env: Env;
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}
