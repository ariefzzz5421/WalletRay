import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WalletRay — Turn replies into recipients",
  description: "Collect, validate, and export EVM and Solana wallet addresses from X replies.",
  applicationName: "WalletRay",
  openGraph: {
    title: "WalletRay — Turn replies into recipients",
    description: "A wallet collector for X community campaigns.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
