import { defineConfig } from "vitest/config";

// Testes de integração: exigem `supabase start`, `supabase functions serve`
// (com supabase/functions/.env apontando para o stub) e o stub de rotas.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});
