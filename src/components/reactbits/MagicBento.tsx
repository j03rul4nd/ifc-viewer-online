import React, { useRef, useEffect, useState, useCallback } from 'react';
import { gsap } from 'gsap';

export interface BentoCardData {
  color?: string;
  title?: string;
  description?: string;
  label?: string;
}

export interface MagicBentoProps {
  cards?: BentoCardData[];
  textAutoHide?: boolean;
  enableStars?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
  particleCount?: number;
  enableTilt?: boolean;
  glowColor?: string;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}

const DEFAULT_GLOW_COLOR = '94, 106, 210';

const createParticleElement = (x: number, y: number, color: string): HTMLDivElement => {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;width:4px;height:4px;border-radius:50%;background:rgba(${color},1);box-shadow:0 0 6px rgba(${color},0.6);pointer-events:none;z-index:100;left:${x}px;top:${y}px;`;
  return el;
};

const ParticleCard: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties; disableAnimations?: boolean; particleCount?: number; glowColor?: string; enableTilt?: boolean; clickEffect?: boolean; enableMagnetism?: boolean }> = ({
  children, className = '', style, disableAnimations = false, particleCount = 12, glowColor = DEFAULT_GLOW_COLOR, enableTilt = false, clickEffect = false, enableMagnetism = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isHoveredRef = useRef(false);
  const magnetRef = useRef<gsap.core.Tween | null>(null);

  const clearParticles = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    magnetRef.current?.kill();
    particlesRef.current.forEach(p => { gsap.to(p, { scale: 0, opacity: 0, duration: 0.3, ease: 'back.in(1.7)', onComplete: () => p.parentNode?.removeChild(p) }); });
    particlesRef.current = [];
  }, []);

  const animateParticles = useCallback(() => {
    if (!cardRef.current || !isHoveredRef.current) return;
    const { width, height } = cardRef.current.getBoundingClientRect();
    Array.from({ length: particleCount }).forEach((_, index) => {
      const id = setTimeout(() => {
        if (!isHoveredRef.current || !cardRef.current) return;
        const clone = createParticleElement(Math.random() * width, Math.random() * height, glowColor);
        cardRef.current.appendChild(clone);
        particlesRef.current.push(clone);
        gsap.fromTo(clone, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
        gsap.to(clone, { x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100, rotation: Math.random() * 360, duration: 2 + Math.random() * 2, ease: 'none', repeat: -1, yoyo: true });
        gsap.to(clone, { opacity: 0.3, duration: 1.5, ease: 'power2.inOut', repeat: -1, yoyo: true });
      }, index * 100);
      timeoutsRef.current.push(id);
    });
  }, [particleCount, glowColor]);

  useEffect(() => {
    if (disableAnimations || !cardRef.current) return;
    const el = cardRef.current;
    const onEnter = () => { isHoveredRef.current = true; animateParticles(); if (enableTilt) gsap.to(el, { rotateX: 5, rotateY: 5, duration: 0.3, ease: 'power2.out', transformPerspective: 1000 }); };
    const onLeave = () => {
      isHoveredRef.current = false; clearParticles();
      if (enableTilt) gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.3, ease: 'power2.out' });
      if (enableMagnetism) gsap.to(el, { x: 0, y: 0, duration: 0.3, ease: 'power2.out' });
    };
    const onMove = (e: MouseEvent) => {
      if (!enableTilt && !enableMagnetism) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const cx = rect.width / 2, cy = rect.height / 2;
      if (enableTilt) gsap.to(el, { rotateX: ((y - cy) / cy) * -10, rotateY: ((x - cx) / cx) * 10, duration: 0.1, ease: 'power2.out', transformPerspective: 1000 });
      if (enableMagnetism) magnetRef.current = gsap.to(el, { x: (x - cx) * 0.05, y: (y - cy) * 0.05, duration: 0.3, ease: 'power2.out' });
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mousemove', onMove);
    return () => { isHoveredRef.current = false; el.removeEventListener('mouseenter', onEnter); el.removeEventListener('mouseleave', onLeave); el.removeEventListener('mousemove', onMove); clearParticles(); };
  }, [animateParticles, clearParticles, disableAnimations, enableTilt, enableMagnetism, clickEffect, glowColor]);

  return <div ref={cardRef} className={`${className} relative overflow-hidden`} style={{ ...style, position: 'relative', overflow: 'hidden' }}>{children}</div>;
};

const MagicBento: React.FC<MagicBentoProps> = ({
  cards,
  textAutoHide = true, enableStars = true, enableBorderGlow = true, disableAnimations = false,
  particleCount = 12, enableTilt = false, glowColor = DEFAULT_GLOW_COLOR, clickEffect = true, enableMagnetism = true,
}) => {
  const defaultCards: BentoCardData[] = [
    { color: '#120F17', title: 'Analytics', description: 'Track user behavior', label: 'Insights' },
    { color: '#120F17', title: 'Dashboard', description: 'Centralized data view', label: 'Overview' },
    { color: '#120F17', title: 'Collaboration', description: 'Work together seamlessly', label: 'Teamwork' },
    { color: '#120F17', title: 'Automation', description: 'Streamline workflows', label: 'Efficiency' },
    { color: '#120F17', title: 'Integration', description: 'Connect favorite tools', label: 'Connectivity' },
    { color: '#120F17', title: 'Security', description: 'Enterprise-grade protection', label: 'Protection' },
  ];
  const data = cards?.length ? cards : defaultCards;
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const shouldDisable = disableAnimations || isMobile;

  return (
    <>
      <style>{`
        .magic-bento-section { --border-color: #2F293A; --background-dark: #120F17; }
        .magic-bento-card--glow::after { content:''; position:absolute; inset:0; padding:6px; background:radial-gradient(var(--glow-radius,200px) circle at var(--glow-x,50%) var(--glow-y,50%), rgba(${glowColor},calc(var(--glow-intensity,0)*0.8)) 0%, rgba(${glowColor},calc(var(--glow-intensity,0)*0.4)) 30%, transparent 60%); border-radius:inherit; -webkit-mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); mask-composite:exclude; pointer-events:none; }
        .magic-bento-card--glow:hover { box-shadow:0 4px 20px rgba(46,24,78,0.4),0 0 30px rgba(${glowColor},0.2); }
      `}</style>
      <div className="magic-bento-section grid gap-2 p-3 max-w-[54rem] select-none">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {data.map((card, index) => {
            const baseClass = `magic-bento-card flex flex-col justify-between relative min-h-[160px] w-full p-5 rounded-[16px] border border-solid font-light overflow-hidden transition-colors duration-300 hover:-translate-y-0.5 ${enableBorderGlow ? 'magic-bento-card--glow' : ''}`;
            const cardStyle = { backgroundColor: card.color ?? 'var(--background-dark)', borderColor: 'var(--border-color)', color: 'white', '--glow-x': '50%', '--glow-y': '50%', '--glow-intensity': '0', '--glow-radius': '200px' } as React.CSSProperties;
            if (enableStars) {
              return (
                <ParticleCard key={index} className={baseClass} style={cardStyle} disableAnimations={shouldDisable} particleCount={particleCount} glowColor={glowColor} enableTilt={enableTilt} clickEffect={clickEffect} enableMagnetism={enableMagnetism}>
                  <div className="text-sm opacity-70">{card.label}</div>
                  <div>
                    <h3 className={`font-normal text-sm m-0 mb-1 ${textAutoHide ? 'line-clamp-1' : ''}`}>{card.title}</h3>
                    <p className={`text-xs leading-5 opacity-90 m-0 ${textAutoHide ? 'line-clamp-2' : ''}`}>{card.description}</p>
                  </div>
                </ParticleCard>
              );
            }
            return (
              <div key={index} className={baseClass} style={cardStyle}>
                <div className="text-sm opacity-70">{card.label}</div>
                <div>
                  <h3 className={`font-normal text-sm m-0 mb-1 ${textAutoHide ? 'line-clamp-1' : ''}`}>{card.title}</h3>
                  <p className={`text-xs leading-5 opacity-90 m-0 ${textAutoHide ? 'line-clamp-2' : ''}`}>{card.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default MagicBento;
