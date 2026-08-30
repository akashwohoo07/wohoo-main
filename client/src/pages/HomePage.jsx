import { useState, useEffect, useRef } from "react";
import { Mountain, Waves, Trees, Moon, Globe, Star, Check } from "lucide-react";

/* ══════════════════════════════════════════════════
   GLOBAL CSS
══════════════════════════════════════════════════ */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600;1,700&family=Jost:wght@200;300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin:0; padding:0; }
  html { scroll-behavior:smooth; }
  body { background:#FAFAF8; color:#111110; font-family:'Jost',sans-serif; overflow-x:hidden; }
  ::selection { background:#FBCFE8; color:#111110; }
  ::-webkit-scrollbar { width:3px; }
  ::-webkit-scrollbar-track { background:#FAFAF8; }
  ::-webkit-scrollbar-thumb { background:#F9A8D4; border-radius:2px; }

  @keyframes fadeUp   { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
  @keyframes marquee  { from{transform:translateX(0)} to{transform:translateX(-50%)} }
  @keyframes float    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes pulseDot { 0%,100%{opacity:.35;transform:scale(1)} 50%{opacity:.9;transform:scale(1.15)} }
  @keyframes slideBar { from{transform:scaleX(0)} to{transform:scaleX(1)} }

  .float-anim  { animation:float 6s ease-in-out infinite; }
  .pulse-dot   { animation:pulseDot 2.5s ease-in-out infinite; }
  .marquee-row { display:flex; white-space:nowrap; animation:marquee 30s linear infinite; }

  /* Scroll reveals */
  .rev    { opacity:0; transform:translateY(40px); transition:opacity .85s cubic-bezier(.16,1,.3,1),transform .85s cubic-bezier(.16,1,.3,1); }
  .rev-l  { opacity:0; transform:translateX(-36px); transition:opacity .85s cubic-bezier(.16,1,.3,1),transform .85s cubic-bezier(.16,1,.3,1); }
  .rev-r  { opacity:0; transform:translateX(36px); transition:opacity .85s cubic-bezier(.16,1,.3,1),transform .85s cubic-bezier(.16,1,.3,1); }
  .rev.on, .rev-l.on, .rev-r.on { opacity:1; transform:none; }

  /* Image zoom on hover */
  .iz { overflow:hidden; }
  .iz img { transition:transform .8s cubic-bezier(.16,1,.3,1); }
  .iz:hover img { transform:scale(1.07); }

  /* ── Mobile-first responsive helpers ── */
  @media (max-width:768px){
    body { cursor:auto !important; }
    .cursor-dot,.cursor-ring { display:none !important; }
    .hide-mob { display:none !important; }
    .mob-col  { flex-direction:column !important; }
    .mob-full { width:100% !important; }
    .mob-p    { padding:80px 20px !important; }
    .mob-p-sm { padding:60px 20px !important; }
    .mob-center { text-align:center !important; align-items:center !important; justify-content:center !important; }
    .mob-grid-1 { grid-template-columns:1fr !important; }
    .mob-grid-2 { grid-template-columns:1fr 1fr !important; }
    .mob-h-auto { height:auto !important; min-height:0 !important; }
    .mob-aspect { aspect-ratio:1/1.1 !important; }
  }
  @media (min-width:769px){
    .hide-desk { display:none !important; }
  }
`;

/* ══════════════════════════════════════════════════
   DATA
══════════════════════════════════════════════════ */
const DESTINATIONS = [
  { name:"Santorini",   country:"Greece",    tag:"Islands",   color:"#BAE6FD", img:"https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&q=85" },
  { name:"Kyoto",       country:"Japan",     tag:"Culture",   color:"#FDE68A", img:"https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=85" },
  { name:"Patagonia",   country:"Argentina", tag:"Adventure", color:"#A7F3D0", img:"https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=85" },
  { name:"Maldives",    country:"South Asia",tag:"Tropical",  color:"#FBD38D", img:"https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800&q=85" },
  { name:"Machu Picchu",country:"Peru",      tag:"Ancient",   color:"#FBCFE8", img:"https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&q=85" },
  { name:"Sahara",      country:"Morocco",   tag:"Desert",    color:"#DDD6FE", img:"https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=85" },
];

const EXPERIENCES = [
  { Icon: Mountain, title:"Mountain Peaks",  sub:"Where silence speaks loudest",     img:"https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=700&q=85" },
  { Icon: Waves,    title:"Ocean Escapes",   sub:"Drift into liquid paradise",         img:"https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=700&q=85" },
  { Icon: Trees,    title:"Forest Temples",  sub:"Ancient paths to inner calm",        img:"https://images.unsplash.com/photo-1448375240586-882707db888b?w=700&q=85" },
  { Icon: Moon,     title:"Desert Nights",   sub:"A billion stars, zero distractions", img:"https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=700&q=85" },
];

const STEPS = [
  { n:"01", title:"Plan Together",  desc:"Co-create your perfect itinerary in real time — no more chaotic group chats." },
  { n:"02", title:"Book Instantly", desc:"2M+ stays and experiences. One tap, zero hidden fees, instant confirmation." },
  { n:"03", title:"Travel Freely",  desc:"Offline maps, live updates, local guides. Wohoo.in is your co-pilot on the road." },
];

const TESTIMONIALS = [
  { quote:"Every detail was handled. All we had to do was show up and fall in love with the world.", name:"Mia & Rafi",   trip:"Amalfi Coast, Italy",  img:"https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?w=120&q=80" },
  { quote:"Wohoo turned our messy bucket list into the trip of a lifetime. Pure magic.",              name:"Priya Sharma", trip:"Japan Rail Journey",    img:"https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&q=80" },
  { quote:"From Patagonia peaks to Maldives lagoons — seamless, soulful, unforgettable.",            name:"Marcus Webb",  trip:"World's Edges",         img:"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80" },
];

const GALLERY = [
  { img:"https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=85", label:"Mediterranean Coast", tall:true },
  { img:"https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&q=85", label:"Kyoto Bamboo",        tall:false },
  { img:"https://images.unsplash.com/photo-1539635278303-d4002c07eae3?w=600&q=85", label:"Alpine Trek",         tall:false },
  { img:"https://images.unsplash.com/photo-1488085061387-422e29b40080?w=600&q=85", label:"Istanbul",            tall:false },
  { img:"https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&q=85", label:"Sahara Dusk",         tall:false },
  { img:"https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=800&q=85", label:"South Pacific",       tall:false },
];

const MARQUEE_WORDS = ["Santorini","✦","Kyoto","✦","Maldives","✦","Patagonia","✦","Iceland","✦","Bali","✦","Morocco","✦","Peru","✦","Norway","✦","Himalayas","✦","Amalfi","✦","Zanzibar","✦"];

/* ══════════════════════════════════════════════════
   HOOKS
══════════════════════════════════════════════════ */
function useScrollReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll(".rev,.rev-l,.rev-r");
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("on"); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    targets.forEach(t => obs.observe(t));
    return () => obs.disconnect();
  }, []);
}

function useAnimatedCount(target, suffix, triggered) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!triggered) return;
    const n = parseFloat(target); let c = 0;
    const step = n / 60;
    const id = setInterval(() => {
      c = Math.min(c + step, n);
      setV(parseFloat(c.toFixed(1)));
      if (c >= n) clearInterval(id);
    }, 25);
    return () => clearInterval(id);
  }, [triggered, target]);
  return `${v}${suffix}`;
}

/* ══════════════════════════════════════════════════
   CURSOR (desktop only)
══════════════════════════════════════════════════ */
function Cursor() {
  const dot = useRef(null); const ring = useRef(null);
  useEffect(() => {
    const mv = e => {
      if (dot.current)  { dot.current.style.left  = e.clientX+"px"; dot.current.style.top  = e.clientY+"px"; }
      if (ring.current) { ring.current.style.left = e.clientX+"px"; ring.current.style.top = e.clientY+"px"; }
    };
    window.addEventListener("mousemove", mv);
    return () => window.removeEventListener("mousemove", mv);
  }, []);
  return (
    <>
      <div ref={dot} style={{ position:"fixed",top:0,left:0,width:8,height:8,borderRadius:"50%",background:"#111110",pointerEvents:"none",zIndex:9999,transform:"translate(-50%,-50%)",transition:"left .08s,top .08s" }} />
      <div ref={ring} style={{ position:"fixed",top:0,left:0,width:36,height:36,borderRadius:"50%",border:"1.5px solid rgba(17,17,16,.22)",pointerEvents:"none",zIndex:9998,transform:"translate(-50%,-50%)",transition:"left .14s,top .14s,width .3s,height .3s" }} />
    </>
  );
}

/* ══════════════════════════════════════════════════
   NAVBAR
══════════════════════════════════════════════════ */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const navLinks = ["Destinations","Experiences","Stories","About"];

  return (
    <>
      <nav style={{
        position:"fixed", top:0, left:0, right:0, zIndex:200,
        padding: scrolled ? "12px 5vw" : "20px 5vw",
        background: scrolled || menuOpen ? "rgba(250,250,248,.96)" : "transparent",
        backdropFilter: scrolled || menuOpen ? "blur(20px)" : "none",
        borderBottom: scrolled || menuOpen ? "1px solid rgba(17,17,16,.07)" : "none",
        transition:"all .45s cubic-bezier(.16,1,.3,1)",
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        {/* Logo */}
        <a href="/" style={{ textDecoration:"none" }}>
          <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"1.65rem", fontWeight:700, letterSpacing:"-0.02em",
            background:"linear-gradient(135deg,#F9A8D4 0%,#ec4899 100%)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            Wohoo
          </span>
          <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"1.65rem", fontWeight:700, letterSpacing:"-0.02em", color:"#111110" }}>.in</span>
        </a>

        {/* Desktop links */}
        <div className="hide-mob" style={{ display:"flex", gap:"2rem" }}>
          {navLinks.map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} style={{
              fontFamily:"'Jost'", fontSize:"13px", fontWeight:500, letterSpacing:".07em",
              color:"rgba(17,17,16,.5)", textDecoration:"none", transition:"color .25s",
            }}
            onMouseEnter={e=>e.target.style.color="#111110"}
            onMouseLeave={e=>e.target.style.color="rgba(17,17,16,.5)"}>{l}</a>
          ))}
        </div>

        {/* Desktop auth */}
        <div className="hide-mob" style={{ display:"flex", gap:"10px", alignItems:"center" }}>
          <a href="/login" style={{
            fontFamily:"'Jost'", fontSize:"12px", fontWeight:600, letterSpacing:".1em", textTransform:"uppercase",
            padding:"9px 22px", borderRadius:"100px", textDecoration:"none", color:"#111110",
            border:"1.5px solid rgba(17,17,16,.2)", transition:"all .3s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(17,17,16,.06)";e.currentTarget.style.borderColor="#111110";}}
          onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="rgba(17,17,16,.2)";}}>
            Log In
          </a>
          <a href="/signup" style={{
            fontFamily:"'Jost'", fontSize:"12px", fontWeight:600, letterSpacing:".1em", textTransform:"uppercase",
            padding:"9px 22px", borderRadius:"100px", textDecoration:"none",
            background:"linear-gradient(135deg,#F9A8D4,#ec4899)", color:"#fff",
            boxShadow:"0 4px 16px rgba(236,72,153,.3)", transition:"all .3s",
          }}
          onMouseEnter={e=>e.currentTarget.style.boxShadow="0 6px 24px rgba(236,72,153,.45)"}
          onMouseLeave={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(236,72,153,.3)"}>
            Sign Up
          </a>
        </div>

        {/* Hamburger */}
        <button className="hide-desk" onClick={()=>setMenuOpen(!menuOpen)} style={{
          background:"none", border:"none", padding:"6px", cursor:"pointer", display:"flex", flexDirection:"column", gap:"5px",
        }}>
          {[0,1,2].map(i=>(
            <span key={i} style={{
              display:"block", width:"22px", height:"2px", background:"#111110", borderRadius:"2px",
              transition:"all .3s",
              transform: menuOpen ? (i===0?"rotate(45deg) translate(5px,5px)":i===2?"rotate(-45deg) translate(5px,-5px)":"") : "",
              opacity: menuOpen && i===1 ? 0 : 1,
            }}/>
          ))}
        </button>
      </nav>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div style={{
          position:"fixed", top:"60px", left:0, right:0, zIndex:199,
          background:"rgba(250,250,248,.98)", backdropFilter:"blur(20px)",
          borderBottom:"1px solid rgba(17,17,16,.08)",
          padding:"20px 6vw 28px", display:"flex", flexDirection:"column", gap:"4px",
        }}>
          {navLinks.map(l=>(
            <a key={l} href={`#${l.toLowerCase()}`} onClick={()=>setMenuOpen(false)} style={{
              fontFamily:"'Jost'", fontSize:"1rem", fontWeight:500, color:"rgba(17,17,16,.7)",
              textDecoration:"none", padding:"12px 0", borderBottom:"1px solid rgba(17,17,16,.06)",
            }}>{l}</a>
          ))}
          <div style={{ display:"flex", gap:"10px", marginTop:"16px" }}>
            <a href="/login" style={{
              flex:1, textAlign:"center", fontFamily:"'Jost'", fontSize:"13px", fontWeight:600, letterSpacing:".1em",
              textTransform:"uppercase", padding:"12px", borderRadius:"100px",
              border:"1.5px solid rgba(17,17,16,.2)", color:"#111110", textDecoration:"none",
            }}>Log In</a>
            <a href="/signup" style={{
              flex:1, textAlign:"center", fontFamily:"'Jost'", fontSize:"13px", fontWeight:600, letterSpacing:".1em",
              textTransform:"uppercase", padding:"12px", borderRadius:"100px",
              background:"linear-gradient(135deg,#F9A8D4,#ec4899)", color:"#fff", textDecoration:"none",
            }}>Sign Up</a>
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════
   STAT COUNTER
══════════════════════════════════════════════════ */
function Stat({ value, suffix, label }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const display = useAnimatedCount(value, suffix, on);
  useEffect(()=>{
    const el=ref.current; if(!el) return;
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setOn(true);obs.disconnect();}},{threshold:.3});
    obs.observe(el); return ()=>obs.disconnect();
  },[]);
  return (
    <div ref={ref} className="rev" style={{ textAlign:"center" }}>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(2.6rem,5vw,4.5rem)", fontWeight:700, lineHeight:1, letterSpacing:"-0.04em",
        background:"linear-gradient(135deg,#F9A8D4,#ec4899)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
        {display}
      </div>
      <div style={{ fontFamily:"'Jost'", fontSize:"11px", fontWeight:500, letterSpacing:".18em", textTransform:"uppercase", color:"rgba(17,17,16,.38)", marginTop:"8px" }}>
        {label}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════ */
export default function WohooHome() {
  useScrollReveal();
  const heroRef = useRef(null);
  const [parallax, setParallax] = useState(0);
  const [activeT, setActiveT] = useState(0);
  const [isMob, setIsMob] = useState(false);

  useEffect(()=>{
    const check=()=>setIsMob(window.innerWidth<=768);
    check();
    window.addEventListener("resize",check);
    return ()=>window.removeEventListener("resize",check);
  },[]);

  useEffect(()=>{
    const h=()=>{ if(heroRef.current) setParallax(window.scrollY * 0.22); };
    window.addEventListener("scroll",h,{passive:true});
    return ()=>window.removeEventListener("scroll",h);
  },[]);

  useEffect(()=>{
    const id=setInterval(()=>setActiveT(i=>(i+1)%TESTIMONIALS.length),5000);
    return ()=>clearInterval(id);
  },[]);

  const px = isMob ? "20px" : "5vw";
  const sectionPad = isMob ? "72px 20px" : "110px 5vw";

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {!isMob && <Cursor />}
      <Nav />

      {/* ══════════════════════════════
          1. HERO
      ══════════════════════════════ */}
      <section ref={heroRef} style={{ position:"relative", height:"100vh", minHeight: isMob ? "600px" : "700px", overflow:"hidden", background:"#FAFAF8" }}>

        {/* Hero image — full height, right side on desktop, full bg on mobile */}
        <div style={{
          position:"absolute",
          right:0, top:0,
          width: isMob ? "100%" : "62%",
          height:"100%",
          transform:`translateY(${parallax * 0.3}px)`,
        }}>
          <img
            src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=90"
            alt="Tropical beach"
            style={{ width:"100%", height:"110%", objectFit:"cover", objectPosition:"center 60%", marginTop:"-5%" }}
          />
          {/* Fade left into white — desktop only */}
          {!isMob && <div style={{ position:"absolute", inset:0, background:"linear-gradient(to right,#FAFAF8 0%,rgba(250,250,248,0) 24%)" }} />}
          {/* Dark overlay on mobile for legibility */}
          {isMob && <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,rgba(17,17,16,.55) 0%,rgba(17,17,16,.35) 50%,rgba(17,17,16,.7) 100%)" }} />}
        </div>

        {/* Pink blob — desktop */}
        {!isMob && <>
          <div style={{ position:"absolute", top:"12%", left:"4%", width:300, height:300, borderRadius:"50%", background:"rgba(249,168,212,.14)", filter:"blur(80px)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", bottom:"18%", left:"22%", width:180, height:180, borderRadius:"50%", background:"rgba(186,230,253,.13)", filter:"blur(60px)", pointerEvents:"none" }} />
        </>}

        {/* Content */}
        <div style={{
          position:"relative", zIndex:10,
          height:"100%", display:"flex", alignItems:"center",
          padding: isMob ? "100px 20px 60px" : `0 5vw`,
        }}>
          <div style={{ maxWidth: isMob ? "100%" : "520px" }}>

            {/* Eyebrow */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28,
              animation:"fadeUp .7s ease both", animationDelay:".15s", opacity:0 }}>
              <span style={{ width:28, height:1, background:"#F9A8D4" }} />
              <span style={{ fontFamily:"'Jost'", fontSize:"11px", fontWeight:600, letterSpacing:".22em", textTransform:"uppercase",
                color: isMob ? "rgba(255,255,255,.75)" : "rgba(17,17,16,.4)" }}>
                The World is Yours
              </span>
            </div>

            {/* Headline */}
            <h1 style={{
              fontFamily:"'Cormorant Garamond',serif",
              fontSize: isMob ? "clamp(3rem,14vw,5rem)" : "clamp(3.5rem,6.5vw,7rem)",
              fontWeight:700, lineHeight:.92, letterSpacing:"-0.03em",
              color: isMob ? "#fff" : "#111110",
              animation:"fadeUp .85s ease both", animationDelay:".32s", opacity:0,
            }}>
              Wander<br />
              <em style={{ fontStyle:"italic", color:"#F9A8D4" }}>boldly,</em><br />
              <span style={{ fontWeight:300, color: isMob ? "rgba(255,255,255,.9)" : "#111110" }}>return changed.</span>
            </h1>

            <p style={{
              fontFamily:"'Jost'", fontSize: isMob?"0.92rem":"1rem", fontWeight:300, lineHeight:1.85,
              color: isMob ? "rgba(255,255,255,.72)" : "rgba(17,17,16,.52)",
              maxWidth:"38ch", marginTop:24, marginBottom:40,
              animation:"fadeUp .85s ease both", animationDelay:".5s", opacity:0,
            }}>
              Wohoo.in curates travel experiences so extraordinary, they reshape how you see the world — and yourself.
            </p>

            {/* Buttons */}
            <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap",
              animation:"fadeUp .85s ease both", animationDelay:".68s", opacity:0 }}>
              <a href="/signup" style={{
                fontFamily:"'Jost'", fontSize:"12px", fontWeight:700, letterSpacing:".12em", textTransform:"uppercase",
                padding:"15px 32px", borderRadius:"100px", textDecoration:"none",
                background:"linear-gradient(135deg,#F9A8D4,#ec4899)", color:"#fff",
                boxShadow:"0 6px 24px rgba(236,72,153,.35)", transition:"all .3s",
              }}>
                Explore Journeys
              </a>
              <a href="#stories" style={{
                fontFamily:"'Jost'", fontSize:"13px", fontWeight:400, textDecoration:"none",
                color: isMob ? "rgba(255,255,255,.7)" : "rgba(17,17,16,.48)",
                display:"flex", alignItems:"center", gap:6, transition:"color .25s",
              }}>
                Watch Stories <span style={{ fontSize:17 }}>↗</span>
              </a>
            </div>

            {/* Floating stats pill */}
            <div className="float-anim" style={{
              marginTop:44, display:"inline-flex", alignItems:"center", gap:14,
              padding:"13px 20px", borderRadius:16,
              background: isMob ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.9)",
              backdropFilter:"blur(16px)", boxShadow:"0 4px 24px rgba(17,17,16,.08)",
              animation:"fadeUp .85s ease both", animationDelay:".86s", opacity:0,
            }}>
              <Globe size={20} color={isMob ? "#FAFAF8" : "#111110"} strokeWidth={1.75} />
              <div>
                <div style={{ fontFamily:"'Jost'", fontWeight:600, fontSize:"13px", color: isMob?"#fff":"#111110" }}>194 destinations</div>
                <div style={{ fontFamily:"'Jost'", fontSize:"11px", color: isMob?"rgba(255,255,255,.6)":"rgba(17,17,16,.4)", marginTop:2 }}>across 6 continents</div>
              </div>
              <div style={{ width:1, height:30, background: isMob?"rgba(255,255,255,.2)":"rgba(17,17,16,.08)", margin:"0 4px" }} />
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span className="pulse-dot" style={{ width:8, height:8, borderRadius:"50%", background:"#4ADE80", display:"inline-block" }} />
                <span style={{ fontFamily:"'Jost'", fontSize:"11px", color: isMob?"rgba(255,255,255,.6)":"rgba(17,17,16,.4)" }}>142 exploring now</span>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll nudge */}
        <div style={{ position:"absolute", bottom:28, left:"50%", transform:"translateX(-50%)", display:"flex", flexDirection:"column", alignItems:"center", gap:6,
          animation:"fadeIn 1.2s ease 1.5s both", opacity:0 }}>
          <div style={{ width:1, height:40, background:`linear-gradient(to bottom,transparent,${isMob?"rgba(255,255,255,.4)":"rgba(17,17,16,.22)"})` }} />
          <span style={{ fontFamily:"'Jost'", fontSize:"9px", letterSpacing:".35em", textTransform:"uppercase", color: isMob?"rgba(255,255,255,.5)":"rgba(17,17,16,.28)" }}>Scroll</span>
        </div>
      </section>

      {/* ══════════════════════════════
          2. MARQUEE
      ══════════════════════════════ */}
      <div style={{ background:"#111110", padding:"13px 0", overflow:"hidden" }}>
        <div className="marquee-row">
          {[...Array(2)].map((_,k)=>MARQUEE_WORDS.map((w,i)=>(
            <span key={`${k}-${i}`} style={{
              fontFamily:"'Cormorant Garamond',serif", fontStyle:"italic",
              fontSize:"1rem", fontWeight:400, letterSpacing:".18em",
              color: w==="✦" ? "#F9A8D4" : "rgba(250,250,248,.5)",
              marginRight:"1.8rem", fontSize: w==="✦"?".6rem":"1rem",
            }}>{w}</span>
          )))}
        </div>
      </div>

      {/* ══════════════════════════════
          3. DESTINATIONS
      ══════════════════════════════ */}
      <section id="destinations" style={{ padding:sectionPad, background:"#FAFAF8" }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>

          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", flexWrap:"wrap", gap:20, marginBottom:20 }}>
            <div className="rev-l">
              <div style={{ fontFamily:"'Jost'", fontSize:"11px", fontWeight:600, letterSpacing:".2em", textTransform:"uppercase", color:"rgba(17,17,16,.38)", marginBottom:14 }}>
                — Curated Destinations
              </div>
              <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(2.2rem,5vw,4.5rem)", fontWeight:700, lineHeight:.92, letterSpacing:"-0.03em" }}>
                Places that will<br />
                <em style={{ color:"#93C5FD", fontStyle:"italic" }}>change everything.</em>
              </h2>
            </div>
            <p className="rev-r" style={{ fontFamily:"'Jost'", fontSize:".92rem", fontWeight:300, lineHeight:1.85, color:"rgba(17,17,16,.48)", maxWidth:"28ch" }}>
              From volcanic archipelagos to ancient forest kingdoms — we find what travel guides miss.
            </p>
          </div>
          <div style={{ height:1, background:"rgba(17,17,16,.07)", marginBottom:48 }} />

          <div style={{ display:"grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(3,1fr)", gap: isMob?12:20 }}>
            {DESTINATIONS.map((d,i)=><DestCard key={d.name} d={d} i={i} isMob={isMob} />)}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          4. EXPERIENCES
      ══════════════════════════════ */}
      <section id="experiences" style={{ padding:sectionPad, background:"#F5F5F3" }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:56 }}>
            <div className="rev" style={{ fontFamily:"'Jost'", fontSize:"11px", fontWeight:600, letterSpacing:".2em", textTransform:"uppercase", color:"rgba(17,17,16,.38)", marginBottom:14 }}>
              — Every Landscape a New Feeling
            </div>
            <h2 className="rev" style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(2rem,5vw,4rem)", fontWeight:700, lineHeight:.92, letterSpacing:"-0.03em" }}>
              Choose your <em style={{ color:"#86EFAC", fontStyle:"italic" }}>adventure</em>
            </h2>
          </div>
          <div style={{ display:"grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: isMob?12:18 }}>
            {EXPERIENCES.map((exp,i)=><ExpCard key={exp.title} exp={exp} i={i} isMob={isMob} />)}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          5. STATS
      ══════════════════════════════ */}
      <section style={{ padding:sectionPad, background:"#FAFAF8" }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          <div style={{ display:"grid", gridTemplateColumns: isMob?"1fr 1fr":"repeat(4,1fr)", gap: isMob?"32px 20px":48 }}>
            {[
              {value:"194",suffix:"+",  label:"Destinations"},
              {value:"2.4",suffix:"M",  label:"Happy Travelers"},
              {value:"98", suffix:"%",  label:"Satisfaction"},
              {value:"15", suffix:"yrs",label:"Of Expertise"},
            ].map(s=><Stat key={s.label} {...s} />)}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          6. OCEAN VIDEO FEATURE
      ══════════════════════════════ */}
      <section style={{ padding: isMob ? "0 0 72px" : "0 0 110px", background:"#FAFAF8" }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding: `0 ${px}` }}>

          {/* Label row */}
          <div className="rev" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:28 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ width:24, height:1, background:"#F9A8D4" }} />
              <span style={{ fontFamily:"'Jost'", fontSize:"11px", fontWeight:600, letterSpacing:".2em", textTransform:"uppercase", color:"rgba(17,17,16,.38)" }}>
                Feel the Wohoo.in Difference
              </span>
            </div>
            {!isMob && <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"1.05rem", fontStyle:"italic", color:"rgba(17,17,16,.32)" }}>
              Salt air. Bare feet. Total freedom.
            </span>}
          </div>

          {/* Video container — no border, full width */}
          <div className="rev" style={{ borderRadius:isMob?16:24, overflow:"hidden", position:"relative", height: isMob?"260px":"560px", width:"100%" }}>
            <video
              autoPlay muted loop playsInline
              style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
              poster="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1800&q=85"
            >
              <source src="https://videos.pexels.com/video-files/1437396/1437396-hd_1920_1080_25fps.mp4" type="video/mp4" />
            </video>

            {/* Vignette */}
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,rgba(17,17,16,.06) 0%,transparent 30%,transparent 65%,rgba(17,17,16,.25) 100%)", pointerEvents:"none" }} />

            {/* Bottom-left badge */}
            <div style={{
              position:"absolute", bottom: isMob?16:28, left: isMob?16:28,
              background:"rgba(250,250,248,.88)", backdropFilter:"blur(20px)",
              borderRadius:14, padding: isMob?"12px 16px":"16px 22px",
              display:"flex", alignItems:"center", gap:12,
            }}>
              <div className="pulse-dot" style={{ width:9, height:9, borderRadius:"50%", background:"#F9A8D4", flexShrink:0 }} />
              <div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize: isMob?"1rem":"1.1rem", fontWeight:700, color:"#111110", lineHeight:1.2 }}>Live Experiences</div>
                {!isMob && <div style={{ fontFamily:"'Jost'", fontSize:"11px", color:"rgba(17,17,16,.42)", marginTop:2 }}>Curated for every kind of traveler</div>}
              </div>
            </div>

            {/* Top-right badge */}
            <div style={{
              position:"absolute", top: isMob?14:24, right: isMob?14:24,
              background:"rgba(17,17,16,.52)", backdropFilter:"blur(12px)",
              borderRadius:100, padding: isMob?"7px 14px":"9px 18px",
              fontFamily:"'Jost'", fontSize:"11px", fontWeight:600,
              color:"rgba(250,250,248,.88)", letterSpacing:".1em", textTransform:"uppercase",
              display:"inline-flex", alignItems:"center", gap:7,
            }}>
              <Waves size={14} strokeWidth={2} /> Ocean Journeys
            </div>
          </div>

          {/* 3-column strip below video — seamlessly attached */}
          <div style={{ display:"grid", gridTemplateColumns: isMob?"1fr":"repeat(3,1fr)", gap:1, background:"rgba(17,17,16,.07)", marginTop:1, borderRadius:"0 0 24px 24px", overflow:"hidden" }}>
            {["Maldives · Indian Ocean","Bali · Indonesia","Amalfi · Italy"].map((place,i)=>(
              <div key={place} style={{ background:"#FAFAF8", padding: isMob?"14px 20px":"18px 28px", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background:[`#BAE6FD`,`#A7F3D0`,`#FDE68A`][i], flexShrink:0 }} />
                <span style={{ fontFamily:"'Jost'", fontSize:"12px", fontWeight:500, color:"rgba(17,17,16,.52)", letterSpacing:".05em" }}>{place}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          7. HOW IT WORKS
      ══════════════════════════════ */}
      <section style={{ padding:sectionPad, background:"#F5F5F3", position:"relative", overflow:"hidden" }}>
        {!isMob && <span style={{ position:"absolute", right:"-3%", top:"50%", transform:"translateY(-50%)", fontFamily:"'Cormorant Garamond',serif", fontSize:"28vw", fontWeight:700, color:"transparent", WebkitTextStroke:"1px rgba(17,17,16,.04)", lineHeight:1, userSelect:"none", pointerEvents:"none" }}>✦</span>}

        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap: isMob?0:80, flexDirection: isMob?"column":"row", flexWrap:"wrap" }}>

            <div style={{ flex:"0 0 auto", width: isMob?"100%":"300px", marginBottom: isMob?40:0 }}>
              <div className="rev-l" style={{ fontFamily:"'Jost'", fontSize:"11px", fontWeight:600, letterSpacing:".2em", textTransform:"uppercase", color:"rgba(17,17,16,.38)", marginBottom:14 }}>
                — How Wohoo.in Works
              </div>
              <h2 className="rev-l" style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(2.2rem,4vw,3.8rem)", fontWeight:700, lineHeight:.96, letterSpacing:"-0.03em", marginBottom:32 }}>
                Travel,<br />simplified<br /><em style={{ color:"#F9A8D4" }}>beautifully.</em>
              </h2>
              <a href="/signup" className="rev-l" style={{
                display:"inline-block", fontFamily:"'Jost'", fontSize:"11px", fontWeight:600, letterSpacing:".14em", textTransform:"uppercase",
                padding:"13px 28px", borderRadius:100, textDecoration:"none",
                border:"1.5px solid rgba(17,17,16,.2)", color:"#111110", transition:"all .3s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="#111110";e.currentTarget.style.color="#FAFAF8";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#111110";}}>
                Get Started Free →
              </a>
            </div>

            <div style={{ flex:1, minWidth:0 }}>
              {STEPS.map((s,i)=>(
                <div key={s.n} className="rev" style={{
                  transitionDelay:`${i*.13}s`, display:"flex", gap:28, alignItems:"flex-start",
                  padding:"32px 0", borderBottom: i<STEPS.length-1?"1px solid rgba(17,17,16,.07)":"none",
                }}>
                  <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"1rem", fontWeight:600, color:"rgba(17,17,16,.18)", letterSpacing:".06em", flexShrink:0, paddingTop:4 }}>{s.n}</span>
                  <div>
                    <h3 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(1.4rem,3vw,1.7rem)", fontWeight:700, letterSpacing:"-0.02em", marginBottom:8 }}>{s.title}</h3>
                    <p style={{ fontFamily:"'Jost'", fontSize:".88rem", fontWeight:300, lineHeight:1.8, color:"rgba(17,17,16,.52)" }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          8. GALLERY
      ══════════════════════════════ */}
      <section id="stories" style={{ padding:sectionPad, background:"#FAFAF8" }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <div className="rev" style={{ fontFamily:"'Jost'", fontSize:"11px", fontWeight:600, letterSpacing:".2em", textTransform:"uppercase", color:"rgba(17,17,16,.38)", marginBottom:14 }}>— Moments Captured</div>
            <h2 className="rev" style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(2rem,5vw,4rem)", fontWeight:700, lineHeight:.92, letterSpacing:"-0.03em" }}>
              The world as you've <em style={{ color:"#FDA4AF", fontStyle:"italic" }}>never seen it.</em>
            </h2>
          </div>

          {isMob ? (
            /* Mobile: simple 2-col grid */
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {GALLERY.map(({img,label},i)=>(
                <div key={i} className="rev iz" style={{ borderRadius:14, overflow:"hidden", aspectRatio:"1/1.2", position:"relative", transitionDelay:`${i*.07}s` }}>
                  <img src={img} alt={label} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"10px 12px", background:"linear-gradient(to top,rgba(17,17,16,.55),transparent)" }}>
                    <span style={{ fontFamily:"'Jost'", fontSize:"10px", fontWeight:600, color:"rgba(250,250,248,.8)", letterSpacing:".06em" }}>{label}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Desktop: asymmetric masonry grid */
            <div className="rev" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gridTemplateRows:"repeat(3,200px)", gap:12 }}>
              {GALLERY.map(({img,label,tall},i)=>(
                <div key={i} className="iz" style={{
                  borderRadius:14, overflow:"hidden", position:"relative",
                  gridColumn: i===0?"span 2":"span 1",
                  gridRow: i===0?"span 2":"span 1",
                  ...(i===5 ? {gridColumn:"span 2"} : {}),
                }}>
                  <img src={img} alt={label} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top,rgba(17,17,16,.5),transparent 50%)", opacity:0, transition:"opacity .4s" }}
                    onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>
                    <div style={{ position:"absolute", bottom:16, left:20, fontFamily:"'Jost'", fontSize:"12px", fontWeight:600, color:"rgba(250,250,248,.85)", letterSpacing:".06em" }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════
          9. FULL-BLEED MOUNTAINS
      ══════════════════════════════ */}
      <section style={{ position:"relative", height: isMob?"70vw":"80vh", minHeight: isMob?280:500, overflow:"hidden" }}>
        <img src="https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=1800&q=85"
          alt="Mountains"
          style={{ width:"100%", height:"115%", objectFit:"cover", objectPosition:"center", transform:`translateY(${parallax * 0.18}px)` }} />
        <div style={{ position:"absolute", inset:0, background:"rgba(250,250,248,.52)" }} />
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", padding:"0 5vw" }}>
          <div className="rev" style={{ fontFamily:"'Jost'", fontSize:"10px", fontWeight:600, letterSpacing:".22em", textTransform:"uppercase", color:"rgba(17,17,16,.45)", marginBottom:16 }}>
            — Signature Wohoo.in Journeys
          </div>
          <h2 className="rev" style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(2.2rem,7vw,7rem)", fontWeight:700, lineHeight:.88, letterSpacing:"-0.04em", color:"#111110" }}>
            Above the clouds,<br /><em style={{ color:"#93C5FD", fontStyle:"italic" }}>you are free.</em>
          </h2>
          <a href="/signup" className="rev" style={{
            marginTop:32, display:"inline-block", fontFamily:"'Jost'", fontSize:"12px", fontWeight:700, letterSpacing:".14em", textTransform:"uppercase",
            padding:"15px 32px", borderRadius:100, textDecoration:"none",
            background:"#111110", color:"#FAFAF8", transition:"all .3s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.background="#F9A8D4";e.currentTarget.style.color="#111110";}}
          onMouseLeave={e=>{e.currentTarget.style.background="#111110";e.currentTarget.style.color="#FAFAF8";}}>
            Explore Mountain Trips →
          </a>
        </div>
      </section>

      {/* ══════════════════════════════
          10. TESTIMONIALS
      ══════════════════════════════ */}
      <section style={{ padding:sectionPad, background:"#F5F5F3" }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          <div style={{ display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap: isMob?40:80, alignItems:"center" }}>

            <div>
              <div className="rev-l" style={{ fontFamily:"'Jost'", fontSize:"11px", fontWeight:600, letterSpacing:".2em", textTransform:"uppercase", color:"rgba(17,17,16,.38)", marginBottom:14 }}>— Traveler Stories</div>
              <h2 className="rev-l" style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(2rem,4vw,3.8rem)", fontWeight:700, lineHeight:1, letterSpacing:"-0.03em", marginBottom:44 }}>
                What our travelers<br />say about<br /><em style={{ color:"#F9A8D4" }}>Wohoo.in</em>
              </h2>

              {/* Quote switcher */}
              <div style={{ position:"relative", minHeight:160 }}>
                {TESTIMONIALS.map((t,i)=>(
                  <div key={t.name} style={{
                    position: i===0?"relative":"absolute", top:0, left:0,
                    opacity: i===activeT?1:0, transform: i===activeT?"translateY(0)":"translateY(10px)",
                    transition:"opacity .6s ease,transform .6s ease", pointerEvents: i===activeT?"auto":"none",
                  }}>
                    <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(1.1rem,2.5vw,1.4rem)", fontStyle:"italic", lineHeight:1.65, color:"#111110", marginBottom:22 }}>
                      "{t.quote}"
                    </p>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <img src={t.img} alt={t.name} style={{ width:40, height:40, borderRadius:"50%", objectFit:"cover" }} />
                      <div>
                        <div style={{ fontFamily:"'Jost'", fontWeight:600, fontSize:"13px" }}>{t.name}</div>
                        <div style={{ fontFamily:"'Jost'", fontSize:"11px", color:"rgba(17,17,16,.42)", marginTop:2 }}>{t.trip}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Dots */}
              <div style={{ display:"flex", gap:8, marginTop:40 }}>
                {TESTIMONIALS.map((_,i)=>(
                  <button key={i} onClick={()=>setActiveT(i)} style={{
                    width: i===activeT?28:8, height:8, borderRadius:4, border:"none", cursor:"pointer",
                    background: i===activeT?"linear-gradient(135deg,#F9A8D4,#ec4899)":"rgba(17,17,16,.16)",
                    transition:"all .4s",
                  }}/>
                ))}
              </div>
            </div>

            {/* Image stack */}
            <div className="rev-r" style={{ position:"relative", height: isMob?280:480 }}>
              <div className="iz" style={{ position:"absolute", right:0, top:0, width:"78%", height:"72%", borderRadius:20, overflow:"hidden" }}>
                <img src="https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=700&q=85" alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
              <div className="iz float-anim" style={{ position:"absolute", left:0, bottom:0, width:"55%", height:"50%", borderRadius:16, overflow:"hidden", boxShadow:"0 20px 48px rgba(17,17,16,.12)" }}>
                <img src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&q=85" alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
              {!isMob && <div className="float-anim" style={{
                position:"absolute", bottom:"32%", right:"-6%",
                background:"#FAFAF8", borderRadius:14, padding:"12px 16px",
                boxShadow:"0 8px 32px rgba(17,17,16,.1)", display:"flex", alignItems:"center", gap:10,
              }}>
                <Star size={18} color="#F59E0B" fill="#F59E0B" />
                <div>
                  <div style={{ fontFamily:"'Jost'", fontSize:"13px", fontWeight:600 }}>4.9 / 5.0</div>
                  <div style={{ fontFamily:"'Jost'", fontSize:"11px", color:"rgba(17,17,16,.4)" }}>12k+ reviews</div>
                </div>
              </div>}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          11. CTA
      ══════════════════════════════ */}
      <section id="about" style={{ padding:sectionPad, background:"#111110", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"-30%", left:"50%", transform:"translateX(-50%)", width:600, height:600, borderRadius:"50%", background:"rgba(249,168,212,.07)", filter:"blur(100px)", pointerEvents:"none" }} />

        <div style={{ maxWidth:760, margin:"0 auto", textAlign:"center", position:"relative" }}>
          <div className="rev" style={{ fontFamily:"'Jost'", fontSize:"11px", fontWeight:600, letterSpacing:".2em", textTransform:"uppercase", color:"rgba(250,250,248,.3)", marginBottom:18 }}>
            — Join 2.4M Wohoo.in Travelers
          </div>
          <h2 className="rev" style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(2.2rem,6vw,5rem)", fontWeight:700, lineHeight:.92, letterSpacing:"-0.03em", color:"#FAFAF8", marginBottom:18 }}>
            Ready to write your<br /><em style={{ color:"#F9A8D4", fontStyle:"italic" }}>greatest chapter?</em>
          </h2>
          <p className="rev" style={{ fontFamily:"'Jost'", fontSize:"0.95rem", fontWeight:300, lineHeight:1.85, color:"rgba(250,250,248,.42)", maxWidth:"40ch", margin:"0 auto 48px" }}>
            Create your free account and start planning the adventure of a lifetime — in minutes.
          </p>

          <div className="rev" style={{ display:"flex", justifyContent:"center", gap:14, flexWrap:"wrap" }}>
            <a href="/signup" style={{
              fontFamily:"'Jost'", fontSize:"12px", fontWeight:700, letterSpacing:".14em", textTransform:"uppercase",
              padding:"17px 40px", borderRadius:100, textDecoration:"none",
              background:"linear-gradient(135deg,#F9A8D4,#ec4899)", color:"#fff",
              boxShadow:"0 8px 32px rgba(249,168,212,.25)", transition:"all .3s",
            }}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 12px 40px rgba(249,168,212,.45)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow="0 8px 32px rgba(249,168,212,.25)"}>
              Create Free Account
            </a>
            <a href="/login" style={{
              fontFamily:"'Jost'", fontSize:"12px", fontWeight:500, letterSpacing:".12em", textTransform:"uppercase",
              padding:"17px 32px", borderRadius:100, textDecoration:"none",
              border:"1.5px solid rgba(250,250,248,.15)", color:"rgba(250,250,248,.58)", transition:"all .3s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(250,250,248,.38)";e.currentTarget.style.color="#FAFAF8";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(250,250,248,.15)";e.currentTarget.style.color="rgba(250,250,248,.58)";}}>
              Sign In Instead
            </a>
          </div>

          <div className="rev" style={{ display:"flex", justifyContent:"center", gap: isMob?16:32, flexWrap:"wrap", marginTop:36 }}>
            {["Free forever plan","No credit card","Cancel anytime"].map(b=>(
              <span key={b} style={{ fontFamily:"'Jost'", fontSize:"12px", color:"rgba(250,250,248,.26)", display:"flex", alignItems:"center", gap:6 }}>
                <Check size={14} color="#86EFAC" strokeWidth={2.5} /> {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          FOOTER
      ══════════════════════════════ */}
      <footer style={{ background:"#0C0C0B", padding: isMob?"36px 20px":"44px 5vw", borderTop:"1px solid rgba(250,250,248,.05)" }}>
        <div style={{ maxWidth:1280, margin:"0 auto", display:"flex", alignItems: isMob?"flex-start":"center", justifyContent:"space-between", flexWrap:"wrap", gap:24, flexDirection: isMob?"column":"row" }}>
          <div>
            <div>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"1.45rem", fontWeight:700, letterSpacing:"-0.02em",
                background:"linear-gradient(135deg,#F9A8D4,#ec4899)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                Wohoo
              </span>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"1.45rem", fontWeight:700, letterSpacing:"-0.02em", color:"rgba(250,250,248,.8)" }}>.in</span>
            </div>
            <p style={{ fontFamily:"'Jost'", fontSize:"12px", color:"rgba(250,250,248,.22)", marginTop:6 }}>Wander boldly, return changed.</p>
          </div>
          <div style={{ display:"flex", gap: isMob?20:32, flexWrap:"wrap" }}>
            {["Privacy","Terms","Sitemap","Contact"].map(l=>(
              <a key={l} href="#" style={{ fontFamily:"'Jost'", fontSize:"12px", color:"rgba(250,250,248,.28)", textDecoration:"none", transition:"color .2s" }}
              onMouseEnter={e=>e.target.style.color="#FAFAF8"} onMouseLeave={e=>e.target.style.color="rgba(250,250,248,.28)"}>{l}</a>
            ))}
          </div>
          <p style={{ fontFamily:"'Jost'", fontSize:"11px", color:"rgba(250,250,248,.16)" }}>© 2026 Wohoo Travel Inc.</p>
        </div>
      </footer>
    </>
  );
}

/* ══════════════════════════════════════════════════
   DESTINATION CARD
══════════════════════════════════════════════════ */
function DestCard({ d, i, isMob }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);
  useEffect(()=>{
    const el=ref.current; if(!el) return;
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setVis(true);obs.disconnect();}},{threshold:.1});
    obs.observe(el); return ()=>obs.disconnect();
  },[]);
  return (
    <div ref={ref} style={{
      borderRadius:16, overflow:"hidden", position:"relative",
      aspectRatio: isMob?"2/3":"3/4",
      background:"#eee", cursor:"pointer",
      opacity: vis?1:0, transform: vis?"translateY(0)":"translateY(40px)",
      transition:`opacity .75s ease ${i*.08}s,transform .75s cubic-bezier(.16,1,.3,1) ${i*.08}s,box-shadow .4s`,
      boxShadow: hov?"0 24px 48px rgba(17,17,16,.15)":"0 4px 16px rgba(17,17,16,.06)",
    }}
    onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <img src={d.img} alt={d.name} style={{ width:"100%",height:"100%",objectFit:"cover",
        transform:hov?"scale(1.08)":"scale(1)", transition:"transform .85s cubic-bezier(.16,1,.3,1)" }} />
      <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(17,17,16,.8) 28%,rgba(17,17,16,.04) 65%)" }} />
      <div style={{ position:"absolute",top:14,left:14 }}>
        <span style={{ fontFamily:"'Jost'",fontSize:"9px",fontWeight:700,letterSpacing:".15em",textTransform:"uppercase",
          padding:"4px 10px",borderRadius:100,background:d.color,color:"#111110" }}>{d.tag}</span>
      </div>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,padding: isMob?"16px":"22px" }}>
        <div style={{ fontFamily:"'Jost'",fontSize:"10px",letterSpacing:".1em",color:"rgba(250,250,248,.5)",marginBottom:4 }}>{d.country}</div>
        <h3 style={{ fontFamily:"'Cormorant Garamond',serif",fontSize: isMob?"1.3rem":"1.7rem",fontWeight:700,letterSpacing:"-0.02em",color:"#FAFAF8",lineHeight:1.1 }}>{d.name}</h3>
        <div style={{ marginTop:10,fontFamily:"'Jost'",fontSize:"11px",fontWeight:500,color:d.color,
          opacity:hov?1:0,transform:hov?"translateY(0)":"translateY(6px)",transition:"all .35s" }}>Explore →</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   EXPERIENCE CARD
══════════════════════════════════════════════════ */
function ExpCard({ exp, i, isMob }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);
  useEffect(()=>{
    const el=ref.current; if(!el) return;
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setVis(true);obs.disconnect();}},{threshold:.1});
    obs.observe(el); return ()=>obs.disconnect();
  },[]);
  return (
    <div ref={ref} style={{
      borderRadius:16, overflow:"hidden", position:"relative",
      height: isMob?200:340,
      opacity:vis?1:0, transform:vis?"translateY(0)":"translateY(36px)",
      transition:`opacity .75s ease ${i*.1}s,transform .75s ease ${i*.1}s,box-shadow .4s`,
      boxShadow:hov?"0 20px 40px rgba(17,17,16,.12)":"0 2px 12px rgba(17,17,16,.04)",
    }}
    onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <img src={exp.img} alt={exp.title} style={{ width:"100%",height:"100%",objectFit:"cover",
        transform:hov?"scale(1.07)":"scale(1)",transition:"transform .85s cubic-bezier(.16,1,.3,1)" }} />
      <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(17,17,16,.78) 30%,transparent 65%)" }} />
      <div style={{ position:"absolute",bottom:0,left:0,right:0,padding: isMob?"14px":"22px" }}>
        <div style={{ marginBottom:7 }}><exp.Icon size={isMob?18:22} color="#FAFAF8" strokeWidth={1.75} /></div>
        <h3 style={{ fontFamily:"'Cormorant Garamond',serif",fontSize: isMob?"1.1rem":"1.4rem",fontWeight:700,letterSpacing:"-0.02em",color:"#FAFAF8",marginBottom:4 }}>{exp.title}</h3>
        {!isMob && <p style={{ fontFamily:"'Jost'",fontSize:"11px",fontWeight:300,color:"rgba(250,250,248,.58)",lineHeight:1.6 }}>{exp.sub}</p>}
      </div>
    </div>
  );
}