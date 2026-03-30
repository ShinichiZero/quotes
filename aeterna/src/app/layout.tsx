import "./globals.css";
import { Geist, Cormorant_Garamond } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata = {
  title: "Aeterna | Ancient Wisdom",
  description: "A premium $10,000-tier Saints Quote website.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${cormorant.variable} antialiased bg-[#050505] text-white mesh-bg min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
