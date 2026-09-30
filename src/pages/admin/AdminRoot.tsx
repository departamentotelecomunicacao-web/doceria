import { ShieldAlert } from "lucide-react";
import { Outlet } from "react-router";
import { AdminAuthProvider } from "@/admin/auth";
import { isEmbedded } from "@/lib/embed";
import { useDocumentMeta } from "@/lib/seo";

export default function AdminRoot() {
  useDocumentMeta({ title: "Painel", robots: "noindex,nofollow" });

  // Proteção contra clickjacking: o GitHub Pages não permite o cabeçalho
  // frame-ancestors, então o painel se recusa a abrir dentro de iframes.
  if (isEmbedded()) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <ShieldAlert className="mx-auto size-10 text-berry-600" aria-hidden />
          <p className="font-semibold">Por segurança, o painel não pode ser aberto dentro de outro site.</p>
          <a href={window.location.href} target="_top" className="font-semibold underline">Abrir o painel em uma aba própria</a>
        </div>
      </div>
    );
  }

  return (
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  );
}
