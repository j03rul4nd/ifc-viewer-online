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
    <div className="border-b border-[var(--border)]" itemScope itemType="https://schema.org/Question">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full py-[18px] flex items-center justify-between text-left text-[15px] font-medium tracking-tight"
        itemProp="name">
        {q}
        <Icons.Chevron size={14} className="text-[var(--text-dim)] transition-transform flex-shrink-0" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="pb-[18px] text-[13.5px] text-[var(--text-dim)] leading-relaxed"
          itemScope itemType="https://schema.org/Answer"
        >
          <span itemProp="text">{a}</span>
        </motion.div>
      )}
    </div>
  )
}

function HeroPreview() {
  return (
    <div className="relative bg-[var(--bg)] flex overflow-hidden">
      {/* Left: rendered building image */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <img
          src={`${import.meta.env.BASE_URL}Renderizado_3D_detallado_de_edificio_modular.png`}
          alt="IFC building model rendered in browser — multi-storey modular structure with walls, windows, and structural elements highlighted by category"
          className="w-full h-auto block"
          loading="lazy"
        />
        {/* Floating callout */}
        <div className="absolute top-[48%] right-[4%] bg-[rgba(16,16,20,0.92)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[11.5px] backdrop-blur-md">
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
      <nav className="relative z-[2] max-w-[1200px] mx-auto px-7 py-[22px] flex items-center justify-between" aria-label="Main navigation">
        <div className="flex items-center gap-2.5">
          <Icons.Logo size={24} aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">IFC Viewer</span>
        </div>
        <div className="flex items-center gap-5 text-[13px] text-[var(--text-dim)]">
          <a href="#features" className="text-inherit no-underline hover:text-[var(--text)] transition-colors">Features</a>
          <a href="#how" className="text-inherit no-underline hover:text-[var(--text)] transition-colors">How it works</a>
          <a href="#faq" className="text-inherit no-underline hover:text-[var(--text)] transition-colors">FAQ</a>
          <a href="https://github.com/j03rul4nd/ifc-viewer-online" target="_blank" rel="noopener noreferrer"
            className="text-inherit no-underline hover:text-[var(--text)] transition-colors" aria-label="View source code on GitHub">GitHub</a>
          <Btn variant="primary" icon={Icons.ArrowRight} onClick={onLaunch}>Open viewer</Btn>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative z-[1] max-w-[1100px] mx-auto px-7 pt-[70px] pb-[60px] text-center">
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text-dim)] mb-7">
            <span className="px-2 py-0.5 rounded-full bg-[rgba(94,106,210,0.15)] text-[var(--accent-2)] text-[10.5px] font-semibold font-mono tracking-wider">FREE</span>
            No login required — runs entirely in your browser
            <Icons.ArrowRight size={12} aria-hidden="true" />
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
          className="text-[19px] text-[var(--text-dim)] leading-[1.45] max-w-[680px] mx-auto tracking-[-0.005em]"
        >
          Open, validate, and non-destructively edit any IFC file directly in your browser.
          No installation, no account, no upload — fast WebGL rendering via WebAssembly.
          Multi-model support, 18 validation rules, IFC export.
        </motion.p>

        <motion.div
          variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.3 }}
          className="flex gap-2.5 justify-center mt-8"
        >
          <Btn variant="primary" size="lg" icon={Icons.Upload} onClick={onLaunch}>Open an IFC file</Btn>
          <a href="https://github.com/j03rul4nd/ifc-viewer-online" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-[38px] px-4 text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
            aria-label="View source code on GitHub">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            View on GitHub
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-5 text-[11.5px] text-[var(--text-faint)]"
        >
          Free · Open source · Runs locally · IFC2x3, IFC4, IFC4x3
        </motion.div>

        {/* Hero card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease: 'easeOut' }}
          className="relative mt-14 rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_40px_90px_-30px_rgba(94,106,210,0.3)]"
          aria-label="Application preview"
        >
          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center gap-2.5">
            <div className="flex gap-1.5" aria-hidden="true">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
            </div>
            <div className="flex-1 text-center text-[11.5px] text-[var(--text-faint)] font-mono">
              IFC Viewer Online — ifcviewer.github.io/ifc-viewer-online
            </div>
          </div>
          <HeroPreview />
        </motion.div>
      </header>

      {/* Compatible strip */}
      <section className="border-t border-b border-[var(--border)] py-[26px] px-7 text-center" aria-label="Supported BIM authoring tools">
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
      <section id="features" className="max-w-[1200px] mx-auto px-7 py-[90px]" aria-labelledby="features-heading">
        <div className="text-center mb-[60px]">
          <div className="text-[12px] text-[var(--accent-2)] tracking-[0.1em] font-mono mb-2.5">FEATURES</div>
          <h2 id="features-heading" className="text-[42px] font-semibold tracking-[-0.03em] m-0">View, validate, and edit IFC</h2>
          <p className="text-[16px] text-[var(--text-dim)] mt-3.5 max-w-[560px] mx-auto">
            Fast, private, and free — no plugins, no accounts, no server.
          </p>
        </div>
        <div className="grid gap-px bg-[var(--border)] border border-[var(--border)] rounded-2xl overflow-hidden" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {[
            { icon: Icons.Upload,   title: 'Drag & drop, no upload', body: 'Open any .ifc file instantly. Parsed client-side via web-ifc WebAssembly — your data never leaves the browser. No account required.' },
            { icon: Icons.Sparkles, title: '18-rule IFC validator', body: 'Detect GUID errors, spatial hierarchy violations, orphan elements, clash detection, and outdated IFC schema versions. Stream results with live progress.' },
            { icon: Icons.Layers,   title: 'Non-destructive editing', body: 'Edit names, LongNames, GlobalIds, and property set values inline. Full undo/redo history. Export corrected IFC with all diffs applied.' },
            { icon: Icons.Ruler,    title: 'Multi-model support', body: 'Load multiple IFC files simultaneously. Independent transforms, validation, export, and quantity takeoff per model.' },
            { icon: Icons.Zap,      title: 'OPFS geometry cache', body: 'Parsed geometry stored in the browser\'s Origin Private File System. Repeat loads are ~10× faster — no re-parsing required.' },
            { icon: Icons.Building, title: 'IFC2x3, IFC4, IFC4x3', body: 'Supports all current IFC schema versions from Revit, ArchiCAD, Tekla, Allplan, Vectorworks and more. Detects outdated schemas.' },
            { icon: Icons.Sparkles, title: 'Quantity takeoff', body: 'Reads IfcElementQuantity data to aggregate area, volume, and length per IFC class. Per-model results updated in real time.' },
            { icon: Icons.Layers,   title: 'IFC + GLB export', body: 'Export corrected IFC binary (diffs applied server-free via IfcAPI worker) or visible scene as GLB. Multi-model export modal.' },
            { icon: Icons.Ruler,    title: 'Camera presets + transforms', body: 'ISO, Top, Front, Left, Right, Bottom views with numpad shortcuts. Non-destructive model position/rotation/scale controls.' },
          ].map((f, i) => (
            <motion.div key={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              className="p-7 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors">
              <div className="w-[34px] h-[34px] rounded-lg bg-[rgba(94,106,210,0.12)] text-[var(--accent-2)] flex items-center justify-center mb-4" aria-hidden="true">
                <f.icon size={16} />
              </div>
              <div className="text-[15px] font-semibold tracking-tight mb-1.5">{f.title}</div>
              <div className="text-[13px] text-[var(--text-dim)] leading-[1.55]">{f.body}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-[var(--border)] py-[90px] px-7" aria-labelledby="how-heading">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-[60px]">
            <div className="text-[12px] text-[var(--accent-2)] tracking-[0.1em] font-mono mb-2.5">HOW IT WORKS</div>
            <h2 id="how-heading" className="text-[42px] font-semibold tracking-[-0.03em] m-0">From file to validated model in seconds</h2>
          </div>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {[
              { n: '01', title: 'Open your IFC', body: 'Click the button or drag & drop a file. Parsed locally in your browser via WebAssembly — works offline. Cached in OPFS for instant repeat loads.' },
              { n: '02', title: 'Validate & edit', body: 'Run 18 built-in rules to detect IFC quality issues. Fix GUIDs in one click. Edit names and property values inline. Full undo/redo history.' },
              { n: '03', title: 'Export', body: 'Export the corrected IFC with all edits applied, or export visible geometry as GLB. No server, no upload — everything runs in your browser.' },
            ].map((s, i) => (
              <motion.div key={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="p-[26px] border border-[var(--border)] rounded-xl bg-[var(--surface)]">
                <div className="font-serif text-[28px] text-[var(--accent-2)] font-normal mb-3.5 tracking-tight" aria-hidden="true">{s.n}</div>
                <div className="text-[16px] font-semibold tracking-tight mb-2">{s.title}</div>
                <div className="text-[13px] text-[var(--text-dim)] leading-[1.55]">{s.body}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Open source callout */}
      <section className="border-t border-[var(--border)] py-[60px] px-7" aria-labelledby="opensource-heading">
        <div className="max-w-[760px] mx-auto text-center">
          <div className="text-[12px] text-[var(--accent-2)] tracking-[0.1em] font-mono mb-2.5">OPEN SOURCE</div>
          <h2 id="opensource-heading" className="text-[32px] font-semibold tracking-[-0.03em] mb-4">Built in public, free forever</h2>
          <p className="text-[15px] text-[var(--text-dim)] leading-[1.55] mb-7 max-w-[540px] mx-auto">
            The source code is on GitHub. Built with <strong>@thatopen/components</strong>, <strong>three.js</strong>, <strong>web-ifc</strong>, and <strong>React</strong>.
            If you need a custom BIM web viewer, validator, or IFC tooling — the author is available for contract work.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a href="https://github.com/j03rul4nd/ifc-viewer-online" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-[38px] px-5 text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
              aria-label="View source code on GitHub">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View source on GitHub
            </a>
            <a href="mailto:joelbenitezdonari@gmail.com"
              className="inline-flex items-center gap-2 h-[38px] px-5 text-[14px] font-medium rounded-[9px] bg-[var(--accent)] text-white hover:brightness-110 transition-all no-underline"
              aria-label="Contact for custom BIM development">
              Contact for custom work
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-[var(--border)] py-[90px] px-7" aria-labelledby="faq-heading"
        itemScope itemType="https://schema.org/FAQPage">
        <div className="max-w-[760px] mx-auto">
          <h2 id="faq-heading" className="text-[36px] font-semibold tracking-[-0.03em] mb-8 text-center">Questions</h2>
          {[
            { q: 'Is my IFC file uploaded anywhere?', a: 'No. Files are parsed entirely in your browser via web-ifc, a WebAssembly build of the open-source IFC parser. Nothing leaves your machine. The app works completely offline once loaded.' },
            { q: 'What IFC versions are supported?', a: 'IFC2x3, IFC4, and IFC4x3. The viewer uses the open-source web-ifc parser — the same engine used by most modern BIM tools and @thatopen/components.' },
            { q: 'Can I load multiple IFC files at once?', a: 'Yes. Load as many IFC files as your device memory allows. Each model has independent visibility, transforms, validation, quantity takeoff, and export. Use the Scene panel to manage them.' },
            { q: 'How does the validation work?', a: 'The validator runs 18 built-in rules in a second Web Worker off the main thread. Rules cover GUID format, spatial hierarchy, orphan elements, naming conventions, missing type assignments, clash detection, and more. Results stream in as each rule completes.' },
            { q: 'Can I fix errors and re-export a corrected IFC?', a: 'Yes. Edits (GUID fixes, renames, property value changes) are held as non-destructive diffs with full undo/redo. Clicking Export IFC applies all diffs to the original IFC binary in a Web Worker and downloads the corrected file.' },
            { q: 'Does it work offline?', a: 'Yes, once the page is loaded. The WebAssembly parser and WebGL renderer run entirely in the browser. Parsed models are cached in OPFS so subsequent loads are instant even without a network connection.' },
            { q: 'What are the file size limits?', a: 'There is no enforced limit — performance depends on your device. Files up to ~200 MB typically load well on modern hardware. The OPFS geometry cache means you only pay the parse cost once.' },
            { q: 'Is it free? Can I use it for commercial projects?', a: 'Yes, completely free. The source code is MIT-licensed. You can use the live app or fork the repository for your own projects.' },
          ].map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[var(--border)] py-20 px-7 text-center" style={{ background: 'radial-gradient(ellipse at center, rgba(94,106,210,0.08), transparent 60%)' }}>
        <h2 className="text-[48px] font-semibold tracking-[-0.03em] mb-4">
          Open an <span className="font-serif italic font-normal">IFC</span> now.
        </h2>
        <p className="text-[16px] text-[var(--text-dim)] mb-3">No login. No upload. Runs in your browser.</p>
        <p className="text-[13px] text-[var(--text-faint)] mb-7">
          Or explore the source on{' '}
          <a href="https://github.com/j03rul4nd/ifc-viewer-online" target="_blank" rel="noopener noreferrer"
            className="text-[var(--accent-2)] hover:underline">
            GitHub
          </a>
        </p>
        <Btn variant="primary" size="lg" icon={Icons.ArrowRight} onClick={onLaunch}>Open the viewer</Btn>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-[26px] px-7 flex justify-between items-center text-[12px] text-[var(--text-faint)] max-w-[1200px] mx-auto">
        <div className="flex items-center gap-2">
          <Icons.Logo size={16} aria-hidden="true" />
          <span>IFC Viewer Online © 2026 — <a href="https://github.com/j03rul4nd" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text)] transition-colors no-underline">Joel Benitez</a></span>
        </div>
        <div className="flex gap-5 items-center flex-wrap">
          <a href="https://github.com/j03rul4nd/ifc-viewer-online" target="_blank" rel="noopener noreferrer"
            className="hover:text-[var(--text)] transition-colors no-underline" aria-label="GitHub repository">
            GitHub
          </a>
          <span>Built with @thatopen/components · three.js · web-ifc</span>
        </div>
      </footer>
    </div>
  )
}
