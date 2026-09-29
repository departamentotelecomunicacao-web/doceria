import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { WEEKDAY_LABELS } from "@/lib/datetime";

export type WeeklyHours = Record<string, [string, string][]>;

export function HoursEditor({ value, onChange, label }: { value: WeeklyHours; onChange: (value: WeeklyHours) => void; label: string }) {
  const setDay = (day: string, windows: [string, string][]) => onChange({ ...value, [day]: windows });
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold text-cocoa-800">{label}</legend>
      {["1", "2", "3", "4", "5", "6", "7"].map((day) => {
        const windows = value[day] ?? [];
        return (
          <div key={day} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-100 p-2">
            <span className="w-20 text-sm font-semibold">{WEEKDAY_LABELS[day]}</span>
            {windows.length === 0 && <span className="text-sm text-cocoa-500">Fechado</span>}
            {windows.map(([open, close], index) => (
              <span key={index} className="flex items-center gap-1">
                <Input type="time" value={open} className="h-9 w-28" aria-label={`${WEEKDAY_LABELS[day]} abre`}
                  onChange={(e) => setDay(day, windows.map((w, i) => (i === index ? [e.target.value, w[1]] : w)))} />
                <span className="text-sm text-cocoa-500">às</span>
                <Input type="time" value={close} className="h-9 w-28" aria-label={`${WEEKDAY_LABELS[day]} fecha`}
                  onChange={(e) => setDay(day, windows.map((w, i) => (i === index ? [w[0], e.target.value] : w)))} />
                <button type="button" className="rounded-full p-1.5 text-cocoa-500 hover:bg-cream-200" aria-label="Remover horário"
                  onClick={() => setDay(day, windows.filter((_, i) => i !== index))}>
                  <X className="size-4" />
                </button>
              </span>
            ))}
            {windows.length < 4 && (
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setDay(day, [...windows, windows.length ? ["14:00", "18:00"] : ["09:00", "18:00"]])}>
                Horário
              </Button>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

export function validateHours(hours: WeeklyHours): string | null {
  for (const [day, windows] of Object.entries(hours)) {
    for (const [open, close] of windows) {
      if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close) || open >= close) {
        return `Horário inválido em ${WEEKDAY_LABELS[day]}: a abertura deve ser antes do fechamento.`;
      }
    }
  }
  return null;
}
