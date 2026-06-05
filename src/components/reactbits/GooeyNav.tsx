import React, { useRef, useEffect, useState } from 'react';

interface GooeyNavItem {
  label: string;
  href: string;
}

export interface GooeyNavProps {
  items: GooeyNavItem[];
  animationTime?: number;
  particleCount?: number;
  particleDistances?: [number, number];
  particleR?: number;
  timeVariance?: number;
  colors?: number[];
  initialActiveIndex?: number;
}

const GooeyNav: React.FC<GooeyNavProps> = ({
  items,
  animationTime = 600,
  particleCount = 15,
  particleDistances = [90, 10],
  particleR = 100,
  timeVariance = 300,
  colors = [1, 2, 3, 1, 2, 3, 1, 4],
  initialActiveIndex = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const filterRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [activeIndex, setActiveIndex] = useState<number>(initialActiveIndex);

  const noise = (n = 1) => n / 2 - Math.random() * n;
  const getXY = (distance: number, pointIndex: number, totalPoints: number): [number, number] => {
    const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180);
    return [distance * Math.cos(angle), distance * Math.sin(angle)];
  };
  const createParticle = (i: number, t: number, d: [number, number], r: number) => {
    const rotate = noise(r / 10);
    return {
      start: getXY(d[0], particleCount - i, particleCount),
      end: getXY(d[1] + noise(7), particleCount - i, particleCount),
      time: t,
      scale: 1 + noise(0.2),
      color: colors[Math.floor(Math.random() * colors.length)],
      rotate: rotate > 0 ? (rotate + r / 20) * 10 : (rotate - r / 20) * 10,
    };
  };
  const makeParticles = (element: HTMLElement) => {
    const d: [number, number] = particleDistances;
    const r = particleR;
    const bubbleTime = animationTime * 2 + timeVariance;
    element.style.setProperty('--time', `${bubbleTime}ms`);
    for (let i = 0; i < particleCount; i++) {
      const t = animationTime * 2 + noise(timeVariance * 2);
      const p = createParticle(i, t, d, r);
      element.classList.remove('active');
      setTimeout(() => {
        const particle = document.createElement('span');
        const point = document.createElement('span');
        particle.classList.add('particle');
        particle.style.setProperty('--start-x', `${p.start[0]}px`);
        particle.style.setProperty('--start-y', `${p.start[1]}px`);
        particle.style.setProperty('--end-x', `${p.end[0]}px`);
        particle.style.setProperty('--end-y', `${p.end[1]}px`);
        particle.style.setProperty('--time', `${p.time}ms`);
        particle.style.setProperty('--scale', `${p.scale}`);
        particle.style.setProperty('--color', `var(--color-${p.color}, rgba(255,255,255,0.8))`);
        particle.style.setProperty('--rotate', `${p.rotate}deg`);
        point.classList.add('point');
        particle.appendChild(point);
        element.appendChild(particle);
        requestAnimationFrame(() => { element.classList.add('active'); });
        setTimeout(() => { try { element.removeChild(particle); } catch { /* ignore */ } }, t);
      }, 30);
    }
  };
  const updateEffectPosition = (element: HTMLElement) => {
    if (!containerRef.current || !filterRef.current || !textRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const pos = element.getBoundingClientRect();
    const styles = {
      left: `${pos.x - containerRect.x}px`,
      top: `${pos.y - containerRect.y}px`,
      width: `${pos.width}px`,
      height: `${pos.height}px`,
    };
    Object.assign(filterRef.current.style, styles);
    Object.assign(textRef.current.style, styles);
    textRef.current.innerText = element.innerText;
  };
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, index: number) => {
    const liEl = e.currentTarget;
    if (activeIndex === index) return;
    setActiveIndex(index);
    updateEffectPosition(liEl);
    if (filterRef.current) {
      filterRef.current.querySelectorAll('.particle').forEach(p => filterRef.current!.removeChild(p));
    }
    if (textRef.current) {
      textRef.current.classList.remove('active');
      void textRef.current.offsetWidth;
      textRef.current.classList.add('active');
    }
    if (filterRef.current) makeParticles(filterRef.current);
  };

  useEffect(() => {
    if (!navRef.current || !containerRef.current) return;
    const activeLi = navRef.current.querySelectorAll('li')[activeIndex] as HTMLElement;
    if (activeLi) {
      updateEffectPosition(activeLi);
      textRef.current?.classList.add('active');
    }
    const ro = new ResizeObserver(() => {
      const li = navRef.current?.querySelectorAll('li')[activeIndex] as HTMLElement;
      if (li) updateEffectPosition(li);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [activeIndex]);

  return (
    <>
      <style>{`
        :root { --gooey-linear-ease: linear(0, 0.068, 0.19 2.7%, 0.804 8.1%, 1.037, 1.199 13.2%, 1.245, 1.27 15.8%, 1.274, 1.272 17.4%, 1.249 19.1%, 0.996 28%, 0.949, 0.928 33.3%, 0.926, 0.933 36.8%, 1.001 45.6%, 1.013, 1.019 50.8%, 1.018 54.4%, 1 63.1%, 0.995 68%, 1.001 85%, 1); }
        .gooey-effect { position: absolute; opacity: 1; pointer-events: none; display: grid; place-items: center; z-index: 1; }
        .gooey-effect.gooey-text { color: white; transition: color 0.3s ease; }
        .gooey-effect.gooey-text.active { color: #0A0A0C; }
        .gooey-effect.gooey-filter { filter: blur(7px) contrast(100) blur(0); mix-blend-mode: lighten; }
        .gooey-effect.gooey-filter::before { content: ""; position: absolute; inset: -75px; z-index: -2; background: black; }
        .gooey-effect.gooey-filter::after { content: ""; position: absolute; inset: 0; background: white; transform: scale(0); opacity: 0; z-index: -1; border-radius: 9999px; }
        .gooey-effect.active::after { animation: gooey-pill 0.3s ease both; }
        @keyframes gooey-pill { to { transform: scale(1); opacity: 1; } }
        .gooey-particle, .gooey-point { display: block; opacity: 0; width: 20px; height: 20px; border-radius: 9999px; transform-origin: center; }
        .gooey-particle { --time: 5s; position: absolute; top: calc(50% - 8px); left: calc(50% - 8px); animation: gooey-particle-anim calc(var(--time)) ease 1 -350ms; }
        .gooey-point { background: var(--color); opacity: 1; animation: gooey-point-anim calc(var(--time)) ease 1 -350ms; }
        @keyframes gooey-particle-anim {
          0% { transform: rotate(0deg) translate(calc(var(--start-x)), calc(var(--start-y))); opacity: 1; animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
          70% { transform: rotate(calc(var(--rotate) * 0.5)) translate(calc(var(--end-x) * 1.2), calc(var(--end-y) * 1.2)); opacity: 1; animation-timing-function: ease; }
          85% { transform: rotate(calc(var(--rotate) * 0.66)) translate(calc(var(--end-x)), calc(var(--end-y))); opacity: 1; }
          100% { transform: rotate(calc(var(--rotate) * 1.2)) translate(calc(var(--end-x) * 0.5), calc(var(--end-y) * 0.5)); opacity: 1; }
        }
        @keyframes gooey-point-anim {
          0% { transform: scale(0); opacity: 0; animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
          25% { transform: scale(calc(var(--scale) * 0.25)); }
          38% { opacity: 1; }
          65% { transform: scale(var(--scale)); opacity: 1; animation-timing-function: ease; }
          85% { transform: scale(var(--scale)); opacity: 1; }
          100% { transform: scale(0); opacity: 0; }
        }
        .gooey-nav-li.active { color: #0A0A0C; text-shadow: none; }
        .gooey-nav-li.active::after { opacity: 1; transform: scale(1); }
        .gooey-nav-li::after { content: ""; position: absolute; inset: 0; border-radius: 8px; background: white; opacity: 0; transform: scale(0); transition: all 0.3s ease; z-index: -1; }
      `}</style>
      <div className="relative" ref={containerRef}>
        <nav className="flex relative" style={{ transform: 'translate3d(0,0,0.01px)' }}>
          <ul
            ref={navRef}
            className="flex gap-1 list-none p-0 px-2 m-0 relative z-[3]"
            style={{ color: 'white', textShadow: '0 1px 1px hsl(205deg 30% 10% / 0.2)' }}
          >
            {items.map((item, index) => (
              <li
                key={index}
                className={`gooey-nav-li rounded-full relative cursor-pointer text-white ${activeIndex === index ? 'active' : ''}`}
              >
                <a
                  href={item.href}
                  onClick={e => handleClick(e, index)}
                  className="outline-none py-[0.45em] px-[0.85em] inline-block text-[13px] no-underline text-inherit"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <span className="gooey-effect gooey-filter" ref={filterRef} />
        <span className="gooey-effect gooey-text" ref={textRef} />
      </div>
    </>
  );
};

export default GooeyNav;
