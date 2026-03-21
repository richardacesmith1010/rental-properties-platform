import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { InstallPromptBanner } from "@/components/pwa/install-prompt";
import { ThemeProvider } from "@/components/theme-provider";
import { SonnerProvider } from "@/components/ui/sonner-provider";
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
  other: {
    copyright: `© ${new Date().getFullYear()} Domus. All rights reserved.`
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", type: "image/svg+xml", sizes: "192x192" },
      { url: "/icons/icon-512.svg", type: "image/svg+xml", sizes: "512x512" }
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }
    ]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Domus"
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7c3aed"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const t = localStorage.getItem('domus-theme');
                if (t && t !== 'atlas-light') {
                  document.documentElement.setAttribute('data-domus-theme', t);
                } else {
                  document.documentElement.removeAttribute('data-domus-theme');
                }
              } catch (e) {}
            `
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          {children}
          <InstallPromptBanner />
          <SonnerProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
