// Datas sempre apresentadas em America/Sao_Paulo, independentemente do fuso do
// aparelho. As regras (janelas, antecedência, expiração) são do servidor.

export const STORE_TIME_ZONE = "America/Sao_Paulo";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: STORE_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const time = new Intl.DateTimeFormat("pt-BR", { timeZone: STORE_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const weekdayDay = new Intl.DateTimeFormat("pt-BR", {
  timeZone: STORE_TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});
const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: STORE_TIME_ZONE, day: "2-digit", month: "2-digit" });
const isoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? dateTime.format(toDate(value)).replace(",", " às") : "";
}

export function formatTime(value: string | Date): string {
  return time.format(toDate(value));
}

export function formatShortDate(value: string | Date): string {
  return shortDate.format(toDate(value));
}

/** Data (AAAA-MM-DD) no fuso da loja. */
export function storeDateKey(value: string | Date): string {
  return isoDate.format(toDate(value));
}

export function formatDayLabel(value: string | Date, now: Date = new Date()): string {
  const key = storeDateKey(value);
  if (key === storeDateKey(now)) return "Hoje";
  if (key === storeDateKey(new Date(now.getTime() + 86_400_000))) return "Amanhã";
  const label = weekdayDay.format(toDate(value));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatSlot(slot: { start: string; end: string }, now?: Date): string {
  return `${formatDayLabel(slot.start, now)}, ${formatTime(slot.start)} às ${formatTime(slot.end)}`;
}

export function formatRelativeMinutes(value: string | Date, now: Date = new Date()): string {
  const diffMin = Math.round((toDate(value).getTime() - now.getTime()) / 60_000);
  if (Math.abs(diffMin) < 1) return "agora";
  const abs = Math.abs(diffMin);
  const label = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} dias`;
  return diffMin > 0 ? `em ${label}` : `há ${label}`;
}

export const WEEKDAY_LABELS: Record<string, string> = {
  "1": "Segunda",
  "2": "Terça",
  "3": "Quarta",
  "4": "Quinta",
  "5": "Sexta",
  "6": "Sábado",
  "7": "Domingo",
};

export type WeeklyHours = Record<string, [string, string][]>;

/** Agrupa dias com o mesmo horário: "Segunda a sexta: 10:00 às 18:00". */
export function summarizeWeeklyHours(hours: WeeklyHours): { days: string; hours: string }[] {
  const rows: { days: string[]; hours: string }[] = [];
  for (const day of ["1", "2", "3", "4", "5", "6", "7"]) {
    const windows = hours[day] ?? [];
    const label = windows.length === 0 ? "Fechado" : windows.map(([open, close]) => `${open} às ${close}`).join(" e ");
    const last = rows[rows.length - 1];
    if (last && last.hours === label) last.days.push(day);
    else rows.push({ days: [day], hours: label });
  }
  return rows.map((row) => ({
    days: row.days.length === 1
      ? WEEKDAY_LABELS[row.days[0]]
      : `${WEEKDAY_LABELS[row.days[0]]} a ${WEEKDAY_LABELS[row.days[row.days.length - 1]].toLowerCase()}`,
    hours: row.hours,
  }));
}
