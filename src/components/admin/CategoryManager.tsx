import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteCategory, listAdminCategories, saveCategory } from "@/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { friendlyMessage } from "@/lib/errors";
import { slugify } from "@/lib/slugify";
import type { Category } from "@/types/domain";

/** Criar, renomear, ordenar e remover categorias (somente o dono). */
export function CategoryManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: listAdminCategories, enabled: open });
  const [editing, setEditing] = useState<Partial<Category> | null>(null);

  const save = useMutation({
    mutationFn: (category: Partial<Category>) =>
      saveCategory(category.id ?? null, {
        name: category.name?.trim() ?? "",
        slug: category.slug || slugify(category.name ?? ""),
        sort_order: Math.max(1, Math.round(Number(category.sort_order) || 1)),
        is_active: category.is_active ?? true,
      }),
    onSuccess: () => {
      toast.success("Categoria salva");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error) => toast.error("Não foi possível salvar", friendlyMessage(error)),
  });
  const remove = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      toast.success("Categoria removida");
      void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
    onError: (error) => toast.error("Não foi possível remover", friendlyMessage(error)),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Categorias" description="Organizam o cardápio (ex.: Clássicos, Especiais, Caixas)." size="lg">
      <div className="space-y-4">
        <ul className="divide-y divide-cream-200">
          {(categories.data ?? []).map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <strong>{category.name}</strong> <span className="text-cocoa-500">· ordem {category.sort_order}</span>
                {!category.is_active && <Badge className="ml-2">oculta</Badge>}
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(category)} aria-label={`Editar ${category.name}`}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => window.confirm(`Remover a categoria ${category.name}? Os produtos ficam sem categoria.`) && remove.mutate(category.id)} aria-label={`Remover ${category.name}`}><Trash2 className="size-4" /></Button>
              </span>
            </li>
          ))}
        </ul>
        {editing ? (
          <div className="grid gap-3 rounded-2xl bg-cream-100 p-4 sm:grid-cols-2">
            <Field label="Nome">{({ id }) => <Input id={id} value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value, slug: editing.id ? editing.slug : slugify(e.target.value) })} />}</Field>
            <Field label="Ordem" hint="1 aparece primeiro.">{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="number" min={1} step={1} value={editing.sort_order ?? 1} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />}</Field>
            <div className="sm:col-span-2"><Checkbox checked={editing.is_active ?? true} onChange={(value) => setEditing({ ...editing, is_active: value })} label="Aparece no cardápio" /></div>
            <div className="flex gap-2 sm:col-span-2">
              <Button size="sm" loading={save.isPending} disabled={(editing.name ?? "").trim().length < 1} onClick={() => save.mutate(editing)}>Salvar</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing({ is_active: true, sort_order: Math.max(0, ...(categories.data ?? []).map((c) => c.sort_order)) + 1 })}>Nova categoria</Button>
        )}
      </div>
    </Dialog>
  );
}
