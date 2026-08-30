// ─────────────────────────────────────────────────────────────
// ICONS — single source of truth for the app's iconography.
// We use Lucide (clean, minimal, stroke-based) instead of emojis so the
// UI reads like a premium product. React UI renders the components directly;
// Mapbox markers/popups (raw HTML strings) use `iconSvg()` to get SVG markup.
// ─────────────────────────────────────────────────────────────
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Plane, TrainFront, Bus, Car, Ship, TramFront, Bike, Footprints,
  MapPin, BedDouble, Utensils, FerrisWheel, Route, Landmark, ShoppingBag,
  StickyNote, Pin, Clock, Globe, Phone, Star, Search, Map as MapIcon,
  Toilet, Baby, Users, PawPrint, SquareParking, Accessibility,
} from "lucide-react";

// Transport mode → icon component (keyed by the same ids used across the app).
export const TRANSPORT_ICON = {
  flight: Plane, train: TrainFront, bus: Bus, car: Car,
  ferry: Ship, metro: TramFront, bike: Bike, walk: Footprints,
};

// Itinerary item type → icon component.
export const TYPE_ICON = {
  destination: MapPin, hotel: BedDouble, restaurant: Utensils, activity: FerrisWheel,
  transport: Route, place: Landmark, shopping: ShoppingBag, note: StickyNote, other: Pin,
};

// Explore / place-search category kind → icon component.
export const KIND_ICON = {
  stays: BedDouble, eats: Utensils, activities: FerrisWheel,
  sights: Landmark, hotel: BedDouble, restaurant: Utensils, place: Landmark,
};

// Place amenity key → icon component (keys come from the backend explore route).
export const AMENITY_ICON = {
  restroom: Toilet, children: Baby, groups: Users,
  pets: PawPrint, parking: SquareParking, accessible: Accessibility,
};

// Icons reused inside map popups / info rows.
export const INFO_ICON = {
  location: MapPin, hours: Clock, website: Globe, phone: Phone, rating: Star, search: Search,
  map: MapIcon,
};

// Render a Lucide component to a standalone SVG string for use inside the raw
// HTML we hand to Mapbox (marker elements + popups). `color` accepts any CSS color.
export function iconSvg(Component, { size = 16, color = "currentColor", strokeWidth = 2 } = {}) {
  if (!Component) return "";
  return renderToStaticMarkup(
    createElement(Component, {
      size, color, strokeWidth,
      style: { display: "inline-block", verticalAlign: "middle" },
    })
  );
}
