import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { updateSettings, type StoreSettingsRow } from "@/api/admin";
import { useToast } from "@/components/ui/Toast";
import { friendlyMessage } from "@/lib/errors";

/** Estado local de uma aba de configurações, salvo como patch parcial. */
export function useSettingsForm<K extends keyof StoreSettingsRow>(settings: StoreSettingsRow, keys: readonly K[]) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const pick = () => Object.fromEntries(keys.map((key) => [key, settings[key]])) as Pick<StoreSettingsRow, K>;
  const [values, setValues] = useState<Pick<StoreSettingsRow, K>>(pick);

  useEffect(() => {
    setValues(pick());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.updated_at]);

  const mutation = useMutation({
    mutationFn: (patch: Partial<StoreSettingsRow>) => updateSettings(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "settings"], data);
      void queryClient.invalidateQueries({ queryKey: ["store-config"] });
      void queryClient.invalidateQueries({ queryKey: ["slots"] });
      toast.success("Configurações salvas", "A loja já usa os novos valores.");
    },
    onError: (error) => toast.error("Não foi possível salvar", friendlyMessage(error)),
  });

  const set = <T extends K>(key: T, value: StoreSettingsRow[T]) => setValues((current) => ({ ...current, [key]: value }));
  const dirty = keys.some((key) => JSON.stringify(values[key]) !== JSON.stringify(settings[key]));
  return { values, set, dirty, save: (patch?: Partial<StoreSettingsRow>) => mutation.mutate(patch ?? values), saving: mutation.isPending };
}
