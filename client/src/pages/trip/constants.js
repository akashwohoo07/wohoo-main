// ─────────────────────────────────────────────────────────────
// CONSTANTS — shared across PlanTab components
// ─────────────────────────────────────────────────────────────

export const CURRENCIES = [
    { code: "INR", symbol: "₹" }, { code: "USD", symbol: "$" },
    { code: "EUR", symbol: "€" }, { code: "GBP", symbol: "£" },
    { code: "JPY", symbol: "¥" }, { code: "AUD", symbol: "A$" },
    { code: "CAD", symbol: "C$" }, { code: "SGD", symbol: "S$" },
    { code: "AED", symbol: "د.إ" }, { code: "THB", symbol: "฿" },
  ];
  
  export const TRANSPORT_MODES = [
    { id: "flight", label: "Flight",    icon: "✈️" },
    { id: "train",  label: "Train",     icon: "🚂" },
    { id: "bus",    label: "Bus",       icon: "🚌" },
    { id: "car",    label: "Car / Cab", icon: "🚗" },
    { id: "ferry",  label: "Ferry",     icon: "⛴️" },
    { id: "metro",  label: "Metro",     icon: "🚇" },
    { id: "bike",   label: "Bike",      icon: "🏍️" },
    { id: "walk",   label: "Walk",      icon: "🚶" },
  ];
  
  export const ADD_CATEGORIES = [
    { type: "destination", label: "Destination",   icon: "📍", color: "text-rose-500 bg-rose-50 border-rose-200",      desc: "City, town or place" },
    { type: "hotel",       label: "Hotel / Stay",  icon: "🏨", color: "text-blue-500 bg-blue-50 border-blue-200",      desc: "Accommodation" },
    { type: "restaurant",  label: "Restaurant",    icon: "🍽️", color: "text-amber-500 bg-amber-50 border-amber-200",   desc: "Food & dining" },
    { type: "activity",    label: "Activity",      icon: "🎯", color: "text-violet-500 bg-violet-50 border-violet-200",desc: "Things to do" },
    { type: "transport",   label: "Transport",     icon: "🚆", color: "text-emerald-500 bg-emerald-50 border-emerald-200", desc: "Getting around" },
    { type: "place",       label: "Place / Sight", icon: "🏛️", color: "text-cyan-500 bg-cyan-50 border-cyan-200",     desc: "Museums, parks, sights" },
    { type: "shopping",    label: "Shopping",      icon: "🛍️", color: "text-pink-500 bg-pink-50 border-pink-200",     desc: "Markets & shops" },
    { type: "note",        label: "Note",          icon: "📝", color: "text-zinc-500 bg-zinc-50 border-zinc-200",      desc: "Free text note" },
    { type: "other",       label: "Other",         icon: "📌", color: "text-orange-500 bg-orange-50 border-orange-200",desc: "Anything else" },
  ];
  
  export const TYPE_META = Object.fromEntries(ADD_CATEGORIES.map((c) => [c.type, c]));
  
  export const COUNTRY_CODES = {
    "india":"in","united states":"us","usa":"us","uk":"gb","united kingdom":"gb",
    "france":"fr","germany":"de","italy":"it","spain":"es","japan":"jp","china":"cn",
    "australia":"au","canada":"ca","brazil":"br","mexico":"mx","russia":"ru",
    "thailand":"th","singapore":"sg","indonesia":"id","malaysia":"my","vietnam":"vn",
    "nepal":"np","sri lanka":"lk","pakistan":"pk","bangladesh":"bd","myanmar":"mm",
    "cambodia":"kh","laos":"la","philippines":"ph","south korea":"kr","taiwan":"tw",
    "hong kong":"hk","new zealand":"nz","south africa":"za","kenya":"ke","egypt":"eg",
    "morocco":"ma","turkey":"tr","greece":"gr","portugal":"pt","netherlands":"nl",
    "belgium":"be","switzerland":"ch","austria":"at","sweden":"se","norway":"no",
    "denmark":"dk","finland":"fi","poland":"pl","czech republic":"cz","hungary":"hu",
    "romania":"ro","ukraine":"ua","israel":"il","saudi arabia":"sa","uae":"ae",
    "united arab emirates":"ae","qatar":"qa","bahrain":"bh","kuwait":"kw","oman":"om",
    "iran":"ir","iraq":"iq","jordan":"jo","lebanon":"lb","argentina":"ar","chile":"cl",
    "colombia":"co","peru":"pe","venezuela":"ve","ecuador":"ec","bolivia":"bo",
    "paraguay":"py","uruguay":"uy","cuba":"cu","jamaica":"jm",
  };
  
  // ── Helpers ────────────────────────────────────────────────────
  
  export function makeCid() {
    return "c-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  }
  
  export function getCountryCode(countryName) {
    if (!countryName) return null;
    return COUNTRY_CODES[countryName.toLowerCase().trim()] || null;
  }
  
  export function newItem(type) {
    const cid = makeCid();
    return {
      _id: cid, clientId: cid, type,
      title: "", date: "", time: "", endDate: "", endTime: "",
      price: "", currency: "INR", notes: "",
      lat: null, lng: null, placeId: "", region: "", isSubDest: false,
      transportMode: type === "transport" ? "flight" : undefined,
      fromStation: "", toStation: "", bookingRef: "",
      fromLat: null, fromLng: null, toLat: null, toLng: null,
      photo: null, rating: null, reviewCount: null, isOpen: null,
    };
  }
  
  export function fmtDateShort(d) {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" });
  }
  
  export function fmtTime(t) {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }
  
  export function getCurrencySymbol(code) {
    return CURRENCIES.find((c) => c.code === code)?.symbol || "₹";
  }