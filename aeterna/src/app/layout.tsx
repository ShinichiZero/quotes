import "./globals.css";
import { Cormorant_Garamond, Sora } from "next/font/google";

const soraSans = Sora({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata = {
  title: "Aeterna | Ancient Wisdom",
  description: "Aeterna: premium saints quote intelligence with deep search, filters, and personal study tools.",
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
                navigator.serviceWorker
                  .getRegistrations()
                  .then(function(registrations) {
                    return Promise.all(
                      registrations.map(function(registration) {
                        return registration.unregister();
                      })
                    );
                  })
                  .catch(function() {});
              }

              if ("caches" in window) {
                caches
                  .keys()
                  .then(function(keys) {
                    return Promise.all(
                      keys.map(function(key) {
                        return caches.delete(key);
                      })
                    );
                  })
                  .catch(function() {});
              }
            `,
          }}
        />
      </head>
      <body
        className={`${soraSans.variable} ${cormorant.variable} antialiased bg-[#050505] text-white min-h-screen`}
      >
        <div className="fixed inset-0 min-h-screen z-[-1] pointer-events-none mesh-bg" />
        {children}
      </body>
    </html>
  );
}
