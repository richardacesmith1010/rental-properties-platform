import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/owner",
          "/manager",
          "/tenant",
          "/tester",
          "/portal",
          "/settings",
          "/api/",
          "/auth/",
        ],
      },
    ],
    sitemap: "https://domusbase.com/sitemap.xml",
  };
}
