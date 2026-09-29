// Ilustração usada quando o produto ainda não tem foto. O tom da massa segue o
// sabor (palavras do nome) e a posição das gotas varia por produto, para o
// cardápio não ficar repetitivo. Fotos reais são enviadas pelo painel.

interface Palette {
  dough: string;
  edge: string;
  chip: string;
  bg: string;
}

const GOLDEN: Palette = { dough: "#D9A066", edge: "#B97A3F", chip: "#3A2417", bg: "#F4E7D4" };
const COCOA: Palette = { dough: "#7A4A2E", edge: "#5E3620", chip: "#F3E6D0", bg: "#EFE2D4" };
const RED_VELVET: Palette = { dough: "#A9463A", edge: "#86352B", chip: "#F7EFE4", bg: "#F3E3DC" };
const PISTACHIO: Palette = { dough: "#D7B47A", edge: "#B8925A", chip: "#6E8B4E", bg: "#EEEBDC" };
const CARAMEL: Palette = { dough: "#E1AF6E", edge: "#C58F52", chip: "#8A4515", bg: "#F6EBDC" };

function paletteFor(name: string): Palette {
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (n.includes("red velvet")) return RED_VELVET;
  if (n.includes("pistache")) return PISTACHIO;
  if (/duplo|triplo|cacau|chocolate belga|brownie/.test(n)) return COCOA;
  if (/doce de leite|caramelo|cafe/.test(n)) return CARAMEL;
  return GOLDEN;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function CookieIllustration({ seed, name = "", className }: { seed: string; name?: string; className?: string }) {
  const h = hash(seed);
  const palette = paletteFor(name);
  const chips = Array.from({ length: 7 }, (_, i) => {
    const angle = ((h >> (i * 3)) % 360) * (Math.PI / 180) + i * 0.9;
    const radius = 14 + ((h >> (i * 2)) % 34);
    return { cx: 100 + Math.cos(angle) * radius, cy: 100 + Math.sin(angle) * radius, r: 4.5 + ((h >> i) % 4) };
  });
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={`Ilustração de ${name || "cookie"} (foto em breve)`}>
      <rect x="-100" y="-100" width="400" height="400" fill={palette.bg} />
      <ellipse cx="104" cy="112" rx="66" ry="62" fill="#000" opacity="0.06" />
      <path d="M100 40c36 0 60 24 60 58 0 36-26 62-60 62-36 0-60-25-60-60 0-35 25-60 60-60Z" fill={palette.edge} />
      <path d="M100 46c32 0 53 22 53 52 0 32-23 55-53 55-32 0-53-23-53-53 0-31 22-54 53-54Z" fill={palette.dough} />
      {chips.map((chip, index) => (
        <circle key={index} cx={chip.cx} cy={chip.cy} r={chip.r} fill={palette.chip} opacity="0.92" />
      ))}
    </svg>
  );
}
