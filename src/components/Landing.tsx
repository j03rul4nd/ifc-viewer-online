import React, { useState } from 'react'
import { motion } from 'framer-motion'
import * as Icons from './Icons'

interface LandingProps { onLaunch: () => void }

const Btn = ({ variant = 'ghost', icon: IconC, children, onClick, size = 'md' }: {
  variant?: 'primary' | 'outline' | 'ghost'; icon?: React.ComponentType<{ size?: number }>
  children?: React.ReactNode; onClick?: () => void; size?: 'md' | 'lg'
}) => {
  const base = 'inline-flex items-center gap-2 font-medium transition-all duration-100 select-none cursor-pointer rounded-[9px]'
  const sizes = { md: 'h-[30px] px-3 text-[13px]', lg: 'h-[38px] px-4 text-[14px]' }
  const variants = {
    primary: 'bg-[var(--accent)] text-white hover:brightness-110',
    outline: 'text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
    ghost: 'text-[var(--text-dim)] hover:text-[var(--text)]',
  }
  return (
    <button onClick={onClick} className={`${base} ${sizes[size]} ${variants[variant]}`}>
      {IconC && <IconC size={size === 'lg' ? 15 : 14} />}
      {children}
    </button>
  )
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[var(--border)]">
      <button onClick={() => setOpen(!open)}
        className="w-full py-[18px] flex items-center justify-between text-left text-[15px] font-medium tracking-tight">
        {q}
        <Icons.Chevron size={14} className="text-[var(--text-dim)] transition-transform flex-shrink-0" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="pb-[18px] text-[13.5px] text-[var(--text-dim)] leading-relaxed"
        >
          {a}
        </motion.div>
      )}
    </div>
  )
}

function HeroPreview() {
  return (
    <div className="relative h-[520px] bg-[var(--bg)] flex overflow-hidden">
      {/* Left: isometric building SVG */}
      <div className="flex-1 relative flex items-center justify-center">
        <svg viewBox="0 0 520 420" width="90%" style={{ maxWidth: 520 }}>
          <defs>
            <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#D0D3DE" /><stop offset="1" stopColor="#8E91A1" />
            </linearGradient>
            <linearGradient id="wallG2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#B9BCCB" /><stop offset="1" stopColor="#7A7D8D" />
            </linearGradient>
            <linearGradient id="roofG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9A6850" /><stop offset="1" stopColor="#6B4333" />
            </linearGradient>
            <linearGradient id="glassG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8FCDE6" stopOpacity="0.7" /><stop offset="1" stopColor="#4680A0" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          <ellipse cx="260" cy="380" rx="210" ry="16" fill="rgba(94,106,210,0.12)" />
          <polygon points="80,330 260,380 440,330 260,290" fill="#52556A" />
          <polygon points="80,330 260,380 260,370 80,320" fill="#3E4154" />
          <polygon points="260,380 440,330 440,320 260,370" fill="#2F3244" />
          <polygon points="80,320 260,370 260,230 80,180" fill="url(#wallG)" />
          <polygon points="260,370 440,320 440,180 260,230" fill="url(#wallG2)" />
          <polygon points="80,180 260,230 440,180 260,130" fill="#E1E3EC" />
          {[0, 1, 2, 3].map(i => (
            <polygon key={i} points={`${105 + i * 38},${310 - i * 10.5} ${135 + i * 38},${318 - i * 10.5} ${135 + i * 38},${275 - i * 10.5} ${105 + i * 38},${267 - i * 10.5}`} fill="url(#glassG)" />
          ))}
          {[0, 1, 2, 3].map(i => (
            <polygon key={i} points={`${278 + i * 38},${365 - i * 10.5} ${308 + i * 38},${357 - i * 10.5} ${308 + i * 38},${310 - i * 10.5} ${278 + i * 38},${318 - i * 10.5}`} fill="url(#glassG)" />
          ))}
          <polygon points="235,345 255,350 255,290 235,285" fill="#8B93E8" />
          <polygon points="80,180 260,230 260,110 80,60" fill="url(#roofG)" opacity="0.55" />
          <polygon points="260,230 440,180 440,60 260,110" fill="url(#roofG)" />
          <polygon points="80,60 260,110 440,60 260,10" fill="#7F5340" />
          <g stroke="#2A2D38" strokeWidth="1" fill="none" opacity="0.6">
            <polygon points="80,320 260,370 440,320 260,230 80,180" />
            <line x1="260" y1="370" x2="260" y2="230" />
            <polygon points="80,180 260,230 440,180 260,130" />
          </g>
          <polygon points="278,365 440,320 440,220 278,265" fill="rgba(94,106,210,0.25)" stroke="#5E6AD2" strokeWidth="1.5" />
          <circle cx="360" cy="290" r="4" fill="#5E6AD2" stroke="white" strokeWidth="1.5" />
        </svg>
        {/* Floating callout */}
        <div className="absolute top-[48%] right-[16%] bg-[rgba(16,16,20,0.92)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[11.5px] backdrop-blur-md">
          <div className="font-mono text-[10px] text-[var(--accent-2)] mb-0.5">IfcWall</div>
          <div className="font-medium">Exterior — 300mm</div>
          <div className="text-[var(--text-dim)] text-[10.5px] mt-0.5">REI 60 · Load bearing</div>
        </div>
      </div>

      {/* Right: mini sidebar */}
      <div className="w-[260px] border-l border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3.5">
        <div>
          <div className="font-mono text-[10px] text-[var(--text-faint)] tracking-[0.1em] mb-1.5">CATEGORIES</div>
        </div>
        {[
          { c: '#C7C9D4', l: 'Walls', n: 142 },
          { c: '#8B93E8', l: 'Doors', n: 27 },
          { c: '#6FB8D9', l: 'Windows', n: 41 },
          { c: '#B9A77A', l: 'Beams', n: 34 },
          { c: '#9B8CC4', l: 'Stairs', n: 3 },
          { c: '#F5A623', l: 'MEP', n: 187 },
        ].map((c, i) => (
          <div key={i} className="flex items-center gap-2 py-0.5 text-[11.5px]">
            <div className="w-2 h-2 rounded-[2px]" style={{ background: c.c }} />
            <span className="flex-1">{c.l}</span>
            <span className="font-mono text-[var(--text-faint)] text-[10.5px]">{c.n}</span>
          </div>
        ))}
        <div className="border-t border-[var(--border)] pt-3 mt-auto text-[11.5px] text-[var(--text-dim)]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-mono text-[var(--ok)]">●</span>
            Model loaded
          </div>
          <div className="text-[var(--text-faint)] text-[10.5px]">Processed in-browser via WebAssembly</div>
        </div>
      </div>
    </div>
  )
}

const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export default function Landing({ onLaunch }: LandingProps) {
  return (
    <div className="absolute inset-0 overflow-auto bg-[var(--bg)] text-[var(--text)]">
      {/* Grid bg */}
      <div className="grid-bg absolute inset-0 pointer-events-none" style={{ maskImage: 'radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)' }} />

      {/* Nav */}
      <nav className="relative z-[2] max-w-[1200px] mx-auto px-7 py-[22px] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Icons.Logo size={24} />
          <span className="text-[15px] font-semibold tracking-tight">IFC Viewer</span>
        </div>
        <div className="flex items-center gap-5 text-[13px] text-[var(--text-dim)]">
          <a href="#features" className="text-inherit no-underline hover:text-[var(--text)] transition-colors">Features</a>
          <a href="#how" className="text-inherit no-underline hover:text-[var(--text)] transition-colors">How it works</a>
          <a href="#faq" className="text-inherit no-underline hover:text-[var(--text)] transition-colors">FAQ</a>
          <Btn variant="primary" icon={Icons.ArrowRight} onClick={onLaunch}>Open viewer</Btn>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative z-[1] max-w-[1100px] mx-auto px-7 pt-[70px] pb-[60px] text-center">
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text-dim)] mb-7">
            <span className="px-2 py-0.5 rounded-full bg-[rgba(94,106,210,0.15)] text-[var(--accent-2)] text-[10.5px] font-semibold font-mono tracking-wider">FREE</span>
            No login required — runs entirely in your browser
            <Icons.ArrowRight size={12} />
          </div>
        </motion.div>

        <motion.h1
          variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.1 }}
          className="text-[clamp(44px,6.5vw,82px)] font-semibold tracking-[-0.035em] leading-[1.02] mb-5 max-w-[900px] mx-auto"
        >
          IFC Viewer <span className="font-serif italic font-normal text-[var(--accent-2)]">Online</span>
        </motion.h1>

        <motion.p
          variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.2 }}
          className="text-[19px] text-[var(--text-dim)] leading-[1.45] max-w-[620px] mx-auto tracking-[-0.005em]"
        >
          Open any IFC file directly in your browser. No installation, no account, no upload —
          fast WebGL rendering via WebAssembly.
        </motion.p>

        <motion.div
          variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.3 }}
          className="flex gap-2.5 justify-center mt-8"
        >
          <Btn variant="primary" size="lg" icon={Icons.Upload} onClick={onLaunch}>Open an IFC file</Btn>
        </motion.div>

        <motion.div
          variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-5 text-[11.5px] text-[var(--text-faint)]"
        >
          Free · Runs locally via WebAssembly · IFC2x3, IFC4, IFC4x3
        </motion.div>

        {/* Hero card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease: 'easeOut' }}
          className="relative mt-14 rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_40px_90px_-30px_rgba(94,106,210,0.3)]"
        >
          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center gap-2.5">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
            </div>
            <div className="flex-1 text-center text-[11.5px] text-[var(--text-faint)] font-mono">
              IFC Viewer Online — Browser-based WebGL rendering
            </div>
          </div>
          <HeroPreview />
        </motion.div>
      </header>

      {/* Compatible strip */}
      <section className="border-t border-b border-[var(--border)] py-[26px] px-7 text-center">
        <div className="text-[11.5px] text-[var(--text-faint)] mb-4 tracking-[0.08em] uppercase">
          Compatible with every major BIM authoring tool
        </div>
        <div className="flex gap-10 justify-center flex-wrap text-[15px] font-medium text-[var(--text-dim)] tracking-tight">
          {['Revit', 'ArchiCAD', 'Tekla', 'Allplan', 'Vectorworks', 'BricsCAD BIM', 'Solibri'].map(t => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-[1200px] mx-auto px-7 py-[90px]">
        <div className="text-center mb-[60px]">
          <div className="text-[12px] text-[var(--accent-2)] tracking-[0.1em] font-mono mb-2.5">FEATURES</div>
          <h2 className="text-[42px] font-semibold tracking-[-0.03em] m-0">Everything you need to view IFC</h2>
          <p className="text-[16px] text-[var(--text-dim)] mt-3.5 max-w-[560px] mx-auto">
            Fast, private, and free — no plugins or accounts required.
          </p>
        </div>
        <div className="grid gap-px bg-[var(--border)] border border-[var(--border)] rounded-2xl overflow-hidden" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {[
            { icon: Icons.Upload,   title: 'Drag & drop or click to browse', body: 'Open any .ifc file instantly. Parsed client-side via web-ifc WebAssembly — your data never leaves the browser.' },
            { icon: Icons.Sparkles, title: 'Element selection', body: 'Click any element to inspect its IFC type, name, and Express ID directly in the viewer.' },
            { icon: Icons.Layers,   title: 'Category filtering', body: 'Toggle walls, slabs, doors, MEP — or isolate a single category with one click.' },
            { icon: Icons.Ruler,    title: 'Orbit controls', body: 'Rotate, pan, and zoom the model freely. Reset to the default view at any time.' },
            { icon: Icons.Zap,      title: 'WebGL rendering', body: 'Hardware-accelerated 3D rendering with realistic lighting, shadows, and transparency.' },
            { icon: Icons.Building, title: 'Broad IFC support', body: 'Supports IFC2x3, IFC4, and IFC4x3 from Revit, ArchiCAD, Tekla, Allplan, and more.' },
          ].map((f, i) => (
            <motion.div key={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              className="p-7 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors">
              <div className="w-[34px] h-[34px] rounded-lg bg-[rgba(94,106,210,0.12)] text-[var(--accent-2)] flex items-center justify-center mb-4">
                <f.icon size={16} />
              </div>
              <div className="text-[15px] font-semibold tracking-tight mb-1.5">{f.title}</div>
              <div className="text-[13px] text-[var(--text-dim)] leading-[1.55]">{f.body}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-[var(--border)] py-[90px] px-7">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-[60px]">
            <div className="text-[12px] text-[var(--accent-2)] tracking-[0.1em] font-mono mb-2.5">HOW IT WORKS</div>
            <h2 className="text-[42px] font-semibold tracking-[-0.03em] m-0">From file to 3D view in seconds</h2>
          </div>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {[
              { n: '01', title: 'Open your IFC', body: 'Click the button or drag & drop a file. Parsed locally in your browser via WebAssembly — works offline.' },
              { n: '02', title: 'Explore the model', body: 'Orbit the 3D scene, click elements to inspect properties, and filter by category.' },
              { n: '03', title: 'Done', body: 'No account, no upload, no waiting. Just open and explore.' },
            ].map((s, i) => (
              <motion.div key={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="p-[26px] border border-[var(--border)] rounded-xl bg-[var(--surface)]">
                <div className="font-serif text-[28px] text-[var(--accent-2)] font-normal mb-3.5 tracking-tight">{s.n}</div>
                <div className="text-[16px] font-semibold tracking-tight mb-2">{s.title}</div>
                <div className="text-[13px] text-[var(--text-dim)] leading-[1.55]">{s.body}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-[var(--border)] py-[90px] px-7">
        <div className="max-w-[760px] mx-auto">
          <h2 className="text-[36px] font-semibold tracking-[-0.03em] mb-8 text-center">Questions</h2>
          {[
            { q: 'Is my IFC file uploaded anywhere?', a: 'No. Files are parsed entirely in your browser via web-ifc, a WebAssembly build of the open-source IFC parser. Nothing leaves your machine.' },
            { q: 'What IFC versions are supported?', a: 'IFC2x3, IFC4, and IFC4x3. The viewer uses the open-source web-ifc parser, the same engine used by most modern BIM tools.' },
            { q: 'Does it work offline?', a: 'Yes, once the page is loaded the WebAssembly parser runs entirely in the browser with no network requests required.' },
            { q: 'What are the file size limits?', a: 'There is no enforced limit — performance depends on your device. Files up to ~200 MB typically load well on modern hardware.' },
            { q: 'Is it free?', a: 'Yes, completely free. No account or login required.' },
          ].map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[var(--border)] py-20 px-7 text-center" style={{ background: 'radial-gradient(ellipse at center, rgba(94,106,210,0.08), transparent 60%)' }}>
        <h2 className="text-[48px] font-semibold tracking-[-0.03em] mb-4">
          Open an <span className="font-serif italic font-normal">IFC</span> now.
        </h2>
        <p className="text-[16px] text-[var(--text-dim)] mb-7">No login. No upload. Runs in your browser.</p>
        <Btn variant="primary" size="lg" icon={Icons.ArrowRight} onClick={onLaunch}>Open the viewer</Btn>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-[26px] px-7 flex justify-between items-center text-[12px] text-[var(--text-faint)] max-w-[1200px] mx-auto">
        <div className="flex items-center gap-2">
          <Icons.Logo size={16} />
          <span>IFC Viewer Online © 2026</span>
        </div>
        <div className="flex gap-5">
          <span>Built with web-ifc + three.js</span>
        </div>
      </footer>
    </div>
  )
}
