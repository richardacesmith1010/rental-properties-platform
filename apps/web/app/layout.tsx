import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { submitFeedback } from "@/app/actions/feedback";
import { HelpMenu } from "@/components/help-menu";
import { InstallPromptBanner } from "@/components/pwa/install-prompt";
import { ThemeProvider } from "@/components/theme-provider";
import { SonnerProvider } from "@/components/ui/sonner-provider";
import { DOMUS_THEME_ATTRIBUTE, DOMUS_THEME_KEY } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const themeInitScript = `
  try {
    const legacyLight = ['atlas', 'light'].join('-');
    const legacyDarkValues = new Set([
      ['noctis', 'neon'].join('-'),
      ['imperium', 'night'].join('-')
    ]);
    const rawTheme = localStorage.getItem('${DOMUS_THEME_KEY}');
    const theme =
      rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system'
        ? rawTheme
        : rawTheme === legacyLight
          ? 'light'
          : legacyDarkValues.has(rawTheme ?? '')
            ? 'dark'
            : 'system';

    if (theme === 'system') {
      document.documentElement.removeAttribute('${DOMUS_THEME_ATTRIBUTE}');
    } else {
      document.documentElement.setAttribute('${DOMUS_THEME_ATTRIBUTE}', theme);
    }
  } catch (error) {}
`;

export const metadata: Metadata = {
  title: {
    default: "Domus — Rental Property Management",
    template: "%s | Domus",
  },
  description:
    "Manage rentals, collect rent, and handle repairs in one place. Owners, managers, and tenants each get the right tools.",
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
            __html: themeInitScript
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          {children}
          <HelpMenu onSubmitFeedback={submitFeedback} />
          <InstallPromptBanner />
          <SonnerProvider />
          {process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true" ? <Analytics /> : null}
        </ThemeProvider>
      </body>
    </html>
  );
}
