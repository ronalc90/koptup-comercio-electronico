import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  // Título de plataforma (raíz, sin contexto de tenant). El nombre real del
  // negocio se muestra dentro de la app vía la config del tenant.
  title: "Meraki — Gestión de pedidos",
  description: "Gestión de pedidos, inventario y despachos",
  manifest: "/manifest.json",
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: { borderRadius: '12px', padding: '12px 16px', fontSize: '14px' },
          }}
        />
      </body>
    </html>
  );
}
