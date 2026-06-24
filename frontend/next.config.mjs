/** @type {import('next').NextConfig} */
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:4000";

export default {
  images: { unoptimized: true },
  transpilePackages: ["@tikimiki/types"],
  // Same-origin proxy → backend, so the auth httpOnly cookie stays first-party
  // and there is no CORS in the browser during development.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_ORIGIN}/api/v1/:path*`,
      },
      {
        // Uploaded avatars/banners are served by the backend at /uploads/*
        // (outside the api/v1 prefix). Proxy them so <img src="/uploads/…">
        // stays same-origin in the browser.
        source: "/uploads/:path*",
        destination: `${BACKEND_ORIGIN}/uploads/:path*`,
      },
    ];
  },
};
