import type { DayPeriod } from "@/types/domain";

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

export function formatRelativeMinutes(value: string | Date, now: Date = new Date()): string {
  const diffMin = Math.round((toDate(value).getTime() - now.getTime()) / 60_000);
  if (Math.abs(diffMin) < 1) return "agora";
  const abs = Math.abs(diffMin);
  const label = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} dias`;
  return diffMin > 0 ? `em ${label}` : `há ${label}`;
}

// ---------------------------------------------------------------------------
// Agenda por data (AAAA-MM-DD) e período. As datas são chaves do calendário
// da loja; convertidas ao meio-dia UTC para não "pular" de dia em outro fuso.
// ---------------------------------------------------------------------------
const WEEKDAYS_LONG = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const PERIOD_TEXT: Record<DayPeriod, string> = { MORNING: "manhã", AFTERNOON: "tarde", EVENING: "noite" };

function parseKey(key: string): { weekday: number; day: string; month: string } {
  const [y, m, d] = key.split("-").map(Number);
  return {
    weekday: new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(),
    day: String(d).padStart(2, "0"),
    month: String(m).padStart(2, "0"),
  };
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/** "Hoje", "Amanhã" ou "Qui 02/10" (para os botões de data). */
export function formatDateChip(key: string, today: string): { top: string; bottom: string } {
  const { weekday, day, month } = parseKey(key);
  if (key === today) return { top: "Hoje", bottom: `${day}/${month}` };
  if (key === addDays(today, 1)) return { top: "Amanhã", bottom: `${day}/${month}` };
  return { top: WEEKDAYS_SHORT[weekday], bottom: `${day}/${month}` };
}

/** "quinta-feira, 02/10, período da tarde" */
export function formatScheduleLong(key: string, period: DayPeriod): string {
  const { weekday, day, month } = parseKey(key);
  const text = `${WEEKDAYS_LONG[weekday]}, ${day}/${month}, período da ${PERIOD_TEXT[period]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Qui 02/10 · Tarde" (listas do painel). */
export function formatScheduleShort(key: string, period: DayPeriod, today?: string): string {
  const { weekday, day, month } = parseKey(key);
  const label = today && key === today ? "Hoje" : today && key === addDays(today, 1) ? "Amanhã" : `${WEEKDAYS_SHORT[weekday]} ${day}/${month}`;
  const p = PERIOD_TEXT[period];
  return `${label} · ${p.charAt(0).toUpperCase()}${p.slice(1)}`;
}

/** Agrupa dias de funcionamento: [1,2,3,4,5,6] -> "Segunda a sábado". */
export function summarizeWeekdays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return "Fechado";
  if (sorted.length === 7) return "Todos os dias";
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length > 2) {
    return `${WEEKDAY_NAMES[sorted[0]]} a ${WEEKDAY_NAMES[sorted[sorted.length - 1]].toLowerCase()}`;
  }
  return sorted.map((d) => WEEKDAY_NAMES[d]).join(", ");
}
