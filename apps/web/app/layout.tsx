import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rental Manager",
  description: "Owner dashboard for rental property operations"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
