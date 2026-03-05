import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Domus — Rental Property Management",
    template: "%s | Domus",
  },
  description:
    "Manage rental properties, collect rent with Stripe, handle maintenance tickets, and run operations for Owner, Manager, and Tenant roles — all in one platform.",
  metadataBase: new URL("https://domusbase.com"),
  openGraph: {
    title: "Domus — Rental Property Management",
    description:
      "Run your rental portfolio with confidence. Properties, payments, maintenance, and documents in one platform.",
    url: "https://domusbase.com",
    siteName: "Domus",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Domus — Rental Property Management",
    description: "Run your rental portfolio with confidence.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-domus-theme="atlas-light">
      <body className={`${inter.variable} font-sans`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('domus-theme') || 'atlas-light';
                  document.documentElement.setAttribute('data-domus-theme', theme);
                } catch (e) {}
              })();
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
