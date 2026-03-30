/** @type {import('next').NextConfig} */
const cacheHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, must-revalidate",
  },
];

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "quotes";
const isGithubPagesBuild = process.env.GITHUB_ACTIONS === "true";

const nextConfig = {
  output: "export",
  basePath: isGithubPagesBuild ? `/${repoName}` : "",
  assetPrefix: isGithubPagesBuild ? `/${repoName}/` : undefined,
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
