import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, Allura } from "next/font/google";
import "./globals.css";
import { studio } from "@/lib/site";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const script = Allura({ subsets: ["latin"], weight: "400", variable: "--font-script", display: "swap" });

const sans = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://qouiglamstudio.co.ke"), // [placeholder: final domain]
  title: { default: `${studio.name} · Makeup artist in Donholm, Nairobi`, template: `%s · ${studio.name}` },
  description: "Soft glam, glam and bridal makeup by Betty in Donholm, Nairobi. House calls available. Book on WhatsApp.",
  openGraph: {
    title: studio.name,
    description: "Makeup that looks like you, on your best day. Book on WhatsApp.",
    locale: "en_KE",
    type: "website",
    images: ["/photos/terracotta-smoky.jpg"],
  },
};

export const viewport: Viewport = { themeColor: "#F7F3EE", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-KE" className={`${serif.variable} ${sans.variable} ${script.variable}`} suppressHydrationWarning>
      <head>
        {/* Marks JS as available so reveal animations never hide content for no-JS visitors. */}
        <script dangerouslySetInnerHTML={{ __html: "(function(){var d=document.documentElement;d.classList.add('js');try{if(sessionStorage.getItem('qoui-loaded')||matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('no-loader')}catch(e){}})()" }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
