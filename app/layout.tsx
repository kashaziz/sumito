import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

/** Set at build time from SUMITO_CUSTOM_DOMAIN (see vite.config.ts); empty for local runs and forks. */
declare const __SUMITO_SITE_URL__: string;

async function siteUrl(): Promise<URL> {
  if (__SUMITO_SITE_URL__) return new URL(__SUMITO_SITE_URL__);
  // No custom domain: fall back to the request's host (local runs, workers.dev, forks).
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(host);
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (isLoopback ? "http" : "https");
  return new URL(`${protocol}://${host}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await siteUrl();
  const socialImage = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    manifest: "/manifest.webmanifest",
    title: "Sumito — Hex Strategy Game",
    description: "A free, open-source game of push and position on a hexagon board. Play a friend or the computer, learn with hints and puzzles, on any screen.",
    openGraph: {
      title: "Sumito — a duel of push and position",
      description: "Slide lines of up to three marbles, outnumber your rival, and push six of their marbles off the edge. Free and open source.",
      type: "website",
      siteName: "Sumito",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "The Sumito title and hexagon board with dark and light marbles" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Sumito — a duel of push and position",
      description: "Slide lines of up to three marbles, outnumber your rival, and push six of their marbles off the edge. Free and open source.",
      images: [socialImage],
    },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Sumito" },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <head>
      {/* vinext ignores viewportFit, so set the full tag here. Browsers use the last viewport tag.
          viewport-fit=cover lets the game use the screen beside a landscape notch; CSS keeps controls clear of it. */}
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#1b1f20" />
      {/* vinext 1.x does not render `metadata.icons`, so the icon tags live here. */}
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      {/* One display face for titles only; body text stays on the system stack. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- this is the App Router root layout, so it covers every route */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@600;700&display=swap" />
    </head>
    <body>{children}<PwaRegister /></body>
  </html>;
}
