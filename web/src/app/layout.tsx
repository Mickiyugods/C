import type { Metadata } from "next";
import { Instrument_Sans, Geist_Mono, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { brand } from "@/config/brand";
import { WalletProvider } from "@/lib/wallet";

// Instrument Sans (body/UI) pairs with Cormorant Garamond (display serif); Geist Mono for data and labels.
const instrument = Instrument_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://usecurato.app"),
  title: { default: `Home - ${brand.name}`, template: `%s - ${brand.name}` },
  description: brand.description,
  openGraph: {
    title: brand.name,
    description: brand.description,
    type: "website",
    siteName: brand.name,
  },
  twitter: {
    card: "summary_large_image",
    title: brand.name,
    description: brand.description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${geistMono.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <WalletProvider>
          <Navbar />
          <main id="main" className="flex-1">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
