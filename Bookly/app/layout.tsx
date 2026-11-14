import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bookly — A good book changes everything",
  description: "An independent bookstore, a thoughtful AI bookseller, and a transparent customer experience workspace. Local demo.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
