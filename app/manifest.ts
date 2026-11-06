import type { MetadataRoute } from "next";

// Lets the league-night check-in screen be installed to a phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HCDGC League Night",
    short_name: "HCDGC",
    description: "Check players in and track who's paid on league night.",
    start_url: "/check-in",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
