import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  hasError: boolean;
}

/** Última barreira: nenhum erro técnico ou tela em branco para o cliente. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro inesperado na interface", error.message, info.componentStack?.slice(0, 500));
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-cream-50 p-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="font-display text-3xl text-cocoa-900">Ops, algo não carregou direito</h1>
          <p className="text-cocoa-600">Recarregue a página. Seu carrinho continua salvo neste aparelho.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-11 rounded-full bg-cocoa-900 px-6 font-semibold text-cream-50"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
