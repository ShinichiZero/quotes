/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Update basePath and assetPrefix based on repository name if deploying to GitHub Pages subpath
  // basePath: "/quotes",
  // assetPrefix: "/quotes/",
};

export default nextConfig;
