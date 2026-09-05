import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Mirrors the homepage (/) hero: split layout with the beach image, cream
// background, Cormorant Garamond headings + Jost body, pink-gradient accents.
// In place of the hero headline/CTA, it shows a Log In / Sign Up tab.

const HERO_IMG =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=90";

const authUrl = (mode) =>
  `${import.meta.env.VITE_API_URL}/api/auth/google?mode=${mode}`;

const COPY = {
  login: {
    eyebrow: "Welcome Back",
    headline: ["Pick up", "where you", "left off."],
    accentIndex: 1,
    subtitle:
      "Log in to keep planning your next unforgettable journey with Wohoo.in.",
    cta: "Continue with Google",
  },
  signup: {
    eyebrow: "Start Your Journey",
    headline: ["Wander", "boldly,", "start here."],
    accentIndex: 1,
    subtitle:
      "Create your free account and start planning the adventure of a lifetime — in minutes.",
    cta: "Sign up with Google",
  },
};

export default function AuthHero({ initialTab = "login" }) {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [notice, setNotice] = useState(null);

  // Surface auth failures the backend redirects back with (e.g. login with no account).
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err === "no_account") {
      setTab("signup");
      setNotice({
        type: "info",
        text: "We couldn't find an account for that Google login. Sign up below to create one — it's free.",
      });
    } else if (err) {
      setNotice({ type: "error", text: "Google sign-in didn't complete. Please try again." });
    }
  }, []);

  const copy = COPY[tab];

  // Already signed in? Skip the login/signup screen and go to the app.
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#FAFAF8]">
      {/* Hero image — right half on desktop, full-bleed on mobile */}
      <div className="absolute right-0 top-0 h-full w-full md:w-[58%]">
        <img
          src={HERO_IMG}
          alt="Tropical beach"
          className="h-full w-full object-cover object-[center_60%]"
        />
        {/* Desktop: fade the image into the cream background on the left */}
        <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-[#FAFAF8] via-[#FAFAF8]/0 to-transparent [--tw-gradient-to-position:24%]" />
        {/* Mobile: darken for legibility */}
        <div className="md:hidden absolute inset-0 bg-gradient-to-b from-[#111110]/60 via-[#111110]/40 to-[#111110]/75" />
      </div>

      {/* Soft pink blobs (desktop) */}
      <div className="hidden md:block absolute top-[12%] left-[4%] w-72 h-72 rounded-full bg-[#F9A8D4]/15 blur-[80px] pointer-events-none" />
      <div className="hidden md:block absolute bottom-[18%] left-[20%] w-44 h-44 rounded-full bg-[#BAE6FD]/15 blur-[60px] pointer-events-none" />

      {/* Logo top-left */}
      <a
        href="/"
        className="absolute top-6 left-[6vw] z-20 flex items-baseline leading-none no-underline"
      >
        <span className="font-serif text-2xl font-bold tracking-tight bg-gradient-to-br from-[#F9A8D4] to-[#ec4899] bg-clip-text text-transparent">
          Wohoo
        </span>
        <span className="font-serif text-2xl font-bold tracking-tight text-white md:text-[#111110]">
          .in
        </span>
      </a>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center px-[6vw] py-24">
        <div className="w-full max-w-[440px]">
          {/* Back to home */}
          <a
            href="/"
            aria-label="Back to home"
            className="inline-flex items-center gap-2 mb-8 font-sans text-[12px] font-medium tracking-[0.02em] no-underline text-white/70 md:text-[#111110]/50 hover:text-white md:hover:text-[#111110] transition-colors"
          >
            <span className="text-base leading-none">←</span> Back to home
          </a>

          {/* Eyebrow */}
          <div className="flex items-center gap-2.5 mb-6">
            <span className="w-7 h-px bg-[#F9A8D4]" />
            <span className="font-sans text-[11px] font-semibold tracking-[0.22em] uppercase text-white/75 md:text-[#111110]/45">
              {copy.eyebrow}
            </span>
          </div>

          {/* Headline (serif, in the hero style) */}
          <h1 className="font-serif font-bold leading-[0.95] tracking-[-0.03em] text-white md:text-[#111110] text-[clamp(2.6rem,7vw,4rem)]">
            {copy.headline.map((line, i) => (
              <span key={i} className="block">
                {i === copy.accentIndex ? (
                  <em className="not-italic italic text-[#F9A8D4]">{line}</em>
                ) : (
                  line
                )}
              </span>
            ))}
          </h1>

          <p className="font-sans font-light leading-[1.8] mt-5 max-w-[38ch] text-white/75 md:text-[#111110]/55 text-[0.95rem]">
            {copy.subtitle}
          </p>

          {/* Auth notice (e.g. "no account found — sign up") */}
          {notice && (
            <div
              className={`mt-6 max-w-sm rounded-2xl px-4 py-3 text-[13px] leading-relaxed font-sans backdrop-blur border ${
                notice.type === "info"
                  ? "bg-[#F9A8D4]/25 md:bg-[#F9A8D4]/15 text-white md:text-[#111110] border-[#F9A8D4]/50"
                  : "bg-red-500/25 md:bg-red-50 text-white md:text-red-700 border-red-400/50"
              }`}
            >
              {notice.text}
            </div>
          )}

          {/* Log In / Sign Up tabs */}
          <div className="inline-flex mt-8 mb-6 p-1 rounded-full border border-white/25 md:border-[#111110]/12 bg-white/10 md:bg-white/60 backdrop-blur">
            {["login", "signup"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-7 py-2.5 rounded-full font-sans text-[11px] font-semibold uppercase tracking-[0.12em] transition-all ${
                  tab === t
                    ? "bg-gradient-to-br from-[#F9A8D4] to-[#ec4899] text-white shadow-[0_4px_16px_rgba(236,72,153,0.35)]"
                    : "text-white/70 md:text-[#111110]/55 hover:text-white md:hover:text-[#111110]"
                }`}
              >
                {t === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Signup helper note */}
          {tab === "signup" && (
            <p className="font-sans text-[12px] leading-relaxed mb-4 max-w-[40ch] text-white/70 md:text-[#111110]/50">
              Already have an account? Signing up logs you in automatically — no
              duplicate accounts are created.
            </p>
          )}

          {/* Google auth */}
          <a
            href={authUrl(tab)}
            className="flex items-center justify-center gap-3 w-full max-w-sm bg-white text-[#111110] font-sans font-semibold text-sm px-8 py-4 rounded-full border border-[#111110]/10 shadow-[0_6px_24px_rgba(17,17,16,0.12)] hover:shadow-[0_10px_32px_rgba(17,17,16,0.18)] transition-all"
          >
            <img
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              className="w-5 h-5"
              alt="Google"
            />
            {copy.cta}
          </a>

          <p className="font-sans text-[12px] mt-5 text-white/55 md:text-[#111110]/40">
            By continuing, you agree to our Terms of Service.
          </p>
        </div>
      </div>
    </section>
  );
}
