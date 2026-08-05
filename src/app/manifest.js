import {
  APP_DESCRIPTION,
  APP_TITLE,
  DEFAULT_PWA_THEME_COLOR,
  PRODUCT_SHORT_NAME,
} from "@/lib/branding";

export default function manifest() {
  return {
    name: APP_TITLE,
    short_name: PRODUCT_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: DEFAULT_PWA_THEME_COLOR,
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/branding/centrix-logo-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/branding/centrix-mark.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
