/** @type {import('next').NextConfig} */
const cacheHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, must-revalidate",
  },
];

const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  ...(process.env.ENABLE_RUNTIME_HEADERS === "true"
    ? {
        async headers() {
          return [
            {
              source: "/index.html",
              headers: cacheHeaders,
            },
            {
              source: "/",
              headers: cacheHeaders,
            },
          ];
        },
      }
    : {}),
  // Update basePath and assetPrefix based on repository name if deploying to GitHub Pages subpath
  // basePath: "/quotes",
  // assetPrefix: "/quotes/",
};

export default nextConfig;
