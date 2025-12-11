import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Energy Dashboard",
  description: "Interní přehled energetiky",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body className="antialiased bg-slate-50 font-sans">{children}</body>
    </html>
  );
}
