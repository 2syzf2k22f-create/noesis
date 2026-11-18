import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NOESIS",
    short_name: "NOESIS",
    description: "Personal site, run by Apollo.",
    start_url: "/",
    display: "standalone",
    background_color: "#070a1c",
    theme_color: "#070a1c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // long-press the app icon on the phone for these
    shortcuts: [
      { name: "Snap the board", short_name: "Snap", url: "/capture", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Reviews due", short_name: "Review", url: "/s/review?review=all", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Revision timetable", short_name: "Plan", url: "/s/school/planner", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
