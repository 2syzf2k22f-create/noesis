import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk, Syne, VT323 } from "next/font/google";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { DEFAULT_THEME, PRESETS, presetsToCss, THEME_KEY } from "@/theme/presets";
import { SwRegister } from "@/components/SwRegister";
import { AppShell } from "@/shell/AppShell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--f-inter", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--f-grotesk", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });
const wide = Syne({ subsets: ["latin"], variable: "--f-wide", display: "swap" });
const pixel = VT323({ subsets: ["latin"], weight: "400", variable: "--f-pixel", display: "swap" });

export const metadata: Metadata = {
  title: "NOESIS",
  description: "Personal site, run by Apollo.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "NOESIS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070a1c",
};

// Applies the saved preset before first paint so there is no flash.
const meta = Object.fromEntries(PRESETS.map((p) => [p.id, [p.frame, p.nav]]));
const themeBoot = `(function(){try{var m=${JSON.stringify(meta)};var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(!m[t])t=${JSON.stringify(DEFAULT_THEME)};var d=document.documentElement;d.dataset.theme=t;d.dataset.frame=m[t][0];d.dataset.nav=m[t][1];}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const def = PRESETS.find((p) => p.id === DEFAULT_THEME)!;
  return (
    <html
      lang="en"
      data-theme={def.id}
      data-frame={def.frame}
      data-nav={def.nav}
      suppressHydrationWarning
      className={`${inter.variable} ${grotesk.variable} ${mono.variable} ${wide.variable} ${pixel.variable}`}
    >
      <head>
        <style id="noesis-presets" dangerouslySetInnerHTML={{ __html: presetsToCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
        <SwRegister />
      </body>
    </html>
  );
}
