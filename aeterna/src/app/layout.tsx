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
      <head>
        <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for(let registration of registrations) {
                    registration.unregister();
                    console.log("Service Worker unregistered via kill-switch.");
                  }
                }).catch(function(err) {
                  console.log("Service Worker unregistration failed: ", err);
                });
              }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${cormorant.variable} antialiased bg-[#050505] text-white min-h-screen`}
      >
        <div className="fixed inset-0 min-h-screen z-[-1] pointer-events-none mesh-bg" />
        {children}
      </body>
    </html>
  );
}
