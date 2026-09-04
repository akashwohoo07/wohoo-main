import { useEffect } from "react";

const DEFAULT_TITLE = "Wohoo — Plan trips & travel itineraries together";

// Lightweight per-route <title> + meta description manager (no extra deps).
// Pass a page title (we suffix "· Wohoo") and an optional description; the
// homepage passes { full: true } to use the brand title verbatim.
export function useSeo({ title, description, full } = {}) {
  useEffect(() => {
    document.title = full ? DEFAULT_TITLE : title ? `${title} · Wohoo` : DEFAULT_TITLE;
    if (description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) {
        m = document.createElement("meta");
        m.setAttribute("name", "description");
        document.head.appendChild(m);
      }
      m.setAttribute("content", description);
    }
  }, [title, description, full]);
}
