import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readJson, writeJson } from "@/lib/storage";
import { addLine, setLineQuantity, type CartLine } from "./cartLogic";

const STORAGE_KEY = "doceria:cart:v1";

interface CartContextValue {
  lines: CartLine[];
  add: (productId: string, quantity: number, max: number) => void;
  setQuantity: (productId: string, quantity: number, max: number) => void;
  remove: (productId: string) => void;
  replace: (lines: CartLine[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function sanitize(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line): line is CartLine =>
      typeof line === "object" && line !== null &&
      typeof (line as CartLine).productId === "string" &&
      Number.isInteger((line as CartLine).quantity) && (line as CartLine).quantity > 0)
    .slice(0, 30);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => sanitize(readJson(STORAGE_KEY, [])));

  useEffect(() => {
    writeJson(STORAGE_KEY, lines);
  }, [lines]);

  // Sincroniza entre abas.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setLines(sanitize(readJson(STORAGE_KEY, [])));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((productId: string, quantity: number, max: number) => {
    setLines((current) => addLine(current, productId, quantity, max));
  }, []);
  const setQuantity = useCallback((productId: string, quantity: number, max: number) => {
    setLines((current) => setLineQuantity(current, productId, quantity, max));
  }, []);
  const remove = useCallback((productId: string) => {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }, []);
  const replace = useCallback((next: CartLine[]) => setLines(next), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(() => ({ lines, add, setQuantity, remove, replace, clear }), [lines, add, setQuantity, remove, replace, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart precisa de CartProvider");
  return context;
}
