import { ArrowUpRight, Play, Sparkles, ShieldCheck } from 'lucide-react';

export default function MidnightHero({onExplore,onReplay}:{onExplore:()=>void;onReplay:()=>void}) {
  return <section className="midnight-hero" aria-label="Executive introduction">
    <div className="hero-copy">
      <div className="hero-eyebrow"><span className="hero-edition">THE GILDED ACE</span><span>MIDNIGHT ROYALE / 2025</span></div>
      <h1 className="hero-title">Read the floor.<br/><em>Make the right move.</em></h1>
      <p className="hero-description">Luck, location, or a leak? Go beyond the bottom ten. Discover what really shaped six months of casino performance.</p>
      <div className="hero-actions"><button className="btn btn-primary" onClick={onExplore}>Explore the floor <ArrowUpRight size={17}/></button><button className="hero-replay-link" onClick={onReplay}><span><Play size={13}/></span>Watch the floor evolve</button></div>
      <div className="hero-verdict"><span>THE CALL</span><strong>Pause blanket replacement.</strong> Inspect one signal. Test one zone. Preserve $91,300.</div>
      <div className="hero-proof"><span><ShieldCheck size={14}/>Verified source data</span><span>310 machines reviewed</span><span>Jan–Jun 2025</span></div>
    </div>
    <div className="hero-orbit" aria-hidden="true">
      <svg className="orbit-svg" viewBox="0 0 460 350" fill="none">
        <defs>
          <radialGradient id="orb-halo"><stop stopColor="#896aff" stopOpacity=".55"/><stop offset="1" stopColor="#896aff" stopOpacity="0"/></radialGradient>
          <linearGradient id="orb-gold" x1="135" y1="75" x2="300" y2="280" gradientUnits="userSpaceOnUse"><stop stopColor="#ffe6a9"/><stop offset=".55" stopColor="#f6bf61"/><stop offset="1" stopColor="#b97839"/></linearGradient>
          <linearGradient id="orb-ring"><stop stopColor="#67e6ff"/><stop offset=".5" stopColor="#9d83ff"/><stop offset="1" stopColor="#67e6ff" stopOpacity=".15"/></linearGradient>
          <filter id="orb-glow"><feGaussianBlur stdDeviation="3"/></filter>
        </defs>
        <circle cx="230" cy="175" r="170" fill="url(#orb-halo)"/>
        <g className="orbit-track orbit-track-one"><ellipse cx="230" cy="175" rx="185" ry="85" transform="rotate(-25 230 175)" stroke="url(#orb-ring)" strokeWidth="1.2"/><circle cx="68" cy="230" r="5" fill="#68e7ff"/><circle cx="68" cy="230" r="12" fill="#68e7ff" opacity=".17"/></g>
        <g className="orbit-track orbit-track-two"><ellipse cx="230" cy="175" rx="155" ry="140" transform="rotate(27 230 175)" stroke="#ad91ff" strokeOpacity=".32" strokeDasharray="3 9"/><circle cx="360" cy="110" r="4" fill="#b49bff"/></g>
        <circle cx="230" cy="175" r="101" fill="#151b3d" fillOpacity=".7" stroke="#a59aff" strokeOpacity=".26"/>
        <circle cx="230" cy="175" r="89" stroke="#f4c66b" strokeOpacity=".23"/>
        <g className="orbit-ace"><path d="M230 98C212 123 171 145 171 177C171 207 204 219 225 196C224 218 215 231 204 244H256C245 231 236 218 235 196C256 219 289 207 289 177C289 145 248 123 230 98Z" fill="url(#orb-gold)"/><path d="M230 110C213 132 184 151 183 174" stroke="#fff0cc" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round"/></g>
        <g stroke="#7de6ff" strokeOpacity=".5"><path d="M68 95h18m-9-9v18"/><path d="M360 261h12m-6-6v12"/><path d="M303 52h10m-5-5v10"/></g>
        <path d="M96 299H365" stroke="#85b5ef" strokeOpacity=".18"/>
        <text x="230" y="322" textAnchor="middle" fill="#b4bedc" fontFamily="sans-serif" fontSize="9" letterSpacing="4">TURN EVIDENCE INTO AN EDGE</text>
      </svg>
      <div className="orbit-caption"><Sparkles size={13}/><span>FLOOR INTELLIGENCE, REIMAGINED</span></div>
    </div>
  </section>;
}
