import { useEffect, useState } from "react";

export interface CepResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/**
 * Autopreenchimento pelo CEP (ViaCEP, serviço público e gratuito). Apenas
 * conveniência: se falhar, o cliente digita o endereço normalmente.
 */
export function useCepLookup(cep: string) {
  const digits = cep.replace(/\D/g, "");
  const [result, setResult] = useState<{ cep: string; data: CepResult | null; loading: boolean }>({ cep: "", data: null, loading: false });

  useEffect(() => {
    if (digits.length !== 8) return;
    const controller = new AbortController();
    setResult({ cep: digits, data: null, loading: true });
    fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string } | null) => {
        if (!json || json.erro) {
          setResult({ cep: digits, data: null, loading: false });
          return;
        }
        setResult({
          cep: digits,
          loading: false,
          data: {
            street: json.logradouro ?? "",
            neighborhood: json.bairro ?? "",
            city: json.localidade ?? "",
            state: json.uf ?? "",
          },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ cep: digits, data: null, loading: false });
      });
    return () => controller.abort();
  }, [digits]);

  return digits.length === 8 && result.cep === digits ? result : { cep: digits, data: null, loading: false };
}
