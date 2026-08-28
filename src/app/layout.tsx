import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Provet → Siigo | Facturación Electrónica",
  description:
    "Dashboard clínico para emisión automatizada de facturación electrónica DIAN — Provet Cloud ↔ Siigo Nube.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-CO">
      <body className="h-screen w-screen overflow-hidden bg-cool-grey text-slate-text antialiased">
        {children}
      </body>
    </html>
  );
}