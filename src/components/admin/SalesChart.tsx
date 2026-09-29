import { useId, useMemo, useState } from "react";
import { formatShortDate } from "@/lib/datetime";
import { formatBRL } from "@/lib/money";

interface Point {
  date: string;
  salesCents: number;
  orders: number;
}

const HEIGHT = 180;
const MAX_BAR = 24;
const GAP = 2;

function niceMax(value: number): number {
  if (value <= 0) return 100_00;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function compactBRL(cents: number): string {
  const value = cents / 100;
  if (value >= 1000) return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/**
 * Vendas confirmadas por dia (uma série, uma cor). Colunas finas com topo
 * arredondado, grade discreta, tooltip por coluna (mouse e teclado) e tabela
 * equivalente para leitores de tela.
 */
export function SalesChart({ data }: { data: Point[] }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(...data.map((point) => point.salesCents), 0)), [data]);
  const ticks = [0, 0.5, 1].map((ratio) => Math.round(max * ratio));
  const width = Math.max(data.length * 28, 280);
  const slot = width / Math.max(data.length, 1);
  const barWidth = Math.min(MAX_BAR, slot - GAP * 2);
  const labelEvery = Math.ceil(data.length / 8);
  const activePoint = active !== null ? data[active] : null;

  return (
    <figure className="space-y-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width + 56} ${HEIGHT + 28}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-labelledby={`${id}-desc`}
          onPointerLeave={() => setActive(null)}
        >
          <desc id={`${id}-desc`}>Vendas confirmadas por dia no período selecionado. Valores detalhados na tabela abaixo.</desc>
          <g transform="translate(52 6)">
            {ticks.map((tick) => {
              const y = HEIGHT - (tick / max) * HEIGHT;
              return (
                <g key={tick}>
                  <line x1={0} x2={width} y1={y} y2={y} stroke="var(--color-cream-200)" strokeWidth={1} />
                  <text x={-8} y={y} dy="0.32em" textAnchor="end" className="fill-cocoa-500 text-[11px] tabular-nums">
                    {compactBRL(tick)}
                  </text>
                </g>
              );
            })}
            {data.map((point, index) => {
              const h = max > 0 ? (point.salesCents / max) * HEIGHT : 0;
              const x = index * slot + (slot - barWidth) / 2;
              const y = HEIGHT - h;
              const r = Math.min(4, h / 2, barWidth / 2);
              const path = h <= 0
                ? ""
                : `M${x},${HEIGHT} V${y + r} Q${x},${y} ${x + r},${y} H${x + barWidth - r} Q${x + barWidth},${y} ${x + barWidth},${y + r} V${HEIGHT} Z`;
              return (
                <g key={point.date}>
                  {path && (
                    <path d={path} fill="var(--color-caramel-500)" opacity={active === null || active === index ? 1 : 0.55} />
                  )}
                  <rect
                    x={index * slot}
                    y={0}
                    width={slot}
                    height={HEIGHT}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${formatShortDate(`${point.date}T12:00:00Z`)}: ${formatBRL(point.salesCents)}, ${point.orders} pedidos`}
                    onPointerEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    className="cursor-default outline-none"
                  />
                  {index % labelEvery === 0 && (
                    <text x={index * slot + slot / 2} y={HEIGHT + 18} textAnchor="middle" className="fill-cocoa-500 text-[11px] tabular-nums">
                      {formatShortDate(`${point.date}T12:00:00Z`)}
                    </text>
                  )}
                </g>
              );
            })}
            <line x1={0} x2={width} y1={HEIGHT} y2={HEIGHT} stroke="var(--color-cream-300)" strokeWidth={1} />
          </g>
        </svg>
        {activePoint && active !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-cream-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${((52 + active * slot + slot / 2) / (width + 56)) * 100}%` }}
            role="status"
          >
            <p className="text-sm font-bold text-cocoa-900">{formatBRL(activePoint.salesCents)}</p>
            <p className="text-cocoa-600">
              {formatShortDate(`${activePoint.date}T12:00:00Z`)} · {activePoint.orders} {activePoint.orders === 1 ? "pedido" : "pedidos"}
            </p>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-cocoa-700">Ver como tabela</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-cocoa-500">
            <tr><th className="py-1 font-medium">Dia</th><th className="py-1 font-medium">Pedidos</th><th className="py-1 text-right font-medium">Vendas</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {data.map((point) => (
              <tr key={point.date} className="border-t border-cream-200">
                <td className="py-1">{formatShortDate(`${point.date}T12:00:00Z`)}</td>
                <td className="py-1">{point.orders}</td>
                <td className="py-1 text-right">{formatBRL(point.salesCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
