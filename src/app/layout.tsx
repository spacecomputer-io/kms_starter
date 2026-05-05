import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Orbitport KMS — Send ETH",
  description:
    "Create an Ethereum key in Orbitport KMS, fund it on Sepolia, and send ETH — without the private key ever leaving the KMS.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
