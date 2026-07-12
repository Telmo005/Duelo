import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Duelo — Apostas P2P",
    short_name: "Duelo",
    description: "Apostas desportivas P2P entre pessoas reais, com dinheiro em custódia e liquidação automática.",
    start_url: "/",
    display: "standalone",
    background_color: "#14151D",
    theme_color: "#14151D",
    lang: "pt",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
