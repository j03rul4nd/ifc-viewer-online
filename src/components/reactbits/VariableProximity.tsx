import { forwardRef, useMemo, useRef, useEffect, MutableRefObject, CSSProperties, HTMLAttributes } from 'react';
import { motion } from 'motion/react';

function useAnimationFrame(callback: () => void) {
  useEffect(() => {
    let frameId: number;
    const loop = () => { callback(); frameId = requestAnimationFrame(loop); };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [callback]);
}

function useMousePositionRef(containerRef: MutableRefObject<HTMLElement | null>) {
  const positionRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const updatePosition = (x: number, y: number) => {
      if (containerRef?.current) {
        const rect = containerRef.current.getBoundingClientRect();
        positionRef.current = { x: x - rect.left, y: y - rect.top };
      } else {
        positionRef.current = { x, y };
      }
    };
    const handleMouseMove = (ev: MouseEvent) => updatePosition(ev.clientX, ev.clientY);
    const handleTouchMove = (ev: TouchEvent) => { const t = ev.touches[0]; updatePosition(t.clientX, t.clientY); };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('touchmove', handleTouchMove); };
  }, [containerRef]);
  return positionRef;
}

interface VariableProximityProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  fromFontVariationSettings: string;
  toFontVariationSettings: string;
  containerRef: MutableRefObject<HTMLElement | null>;
  radius?: number;
  falloff?: 'linear' | 'exponential' | 'gaussian';
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

const VariableProximity = forwardRef<HTMLSpanElement, VariableProximityProps>((props, ref) => {
  const { label, fromFontVariationSettings, toFontVariationSettings, containerRef, radius = 50, falloff = 'linear', className = '', onClick, style, ...restProps } = props;
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const interpolatedSettingsRef = useRef<string[]>([]);
  const mousePositionRef = useMousePositionRef(containerRef);
  const lastPositionRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  const parsedSettings = useMemo(() => {
    const parseSettings = (s: string) => new Map(s.split(',').map(x => x.trim()).map(x => { const [name, value] = x.split(' '); return [name.replace(/['"]/g, ''), parseFloat(value)]; }));
    const from = parseSettings(fromFontVariationSettings);
    const to = parseSettings(toFontVariationSettings);
    return Array.from(from.entries()).map(([axis, fromValue]) => ({ axis, fromValue, toValue: to.get(axis) ?? fromValue }));
  }, [fromFontVariationSettings, toFontVariationSettings]);

  const calcDist = (x1: number, y1: number, x2: number, y2: number) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const calcFalloff = (distance: number) => {
    const norm = Math.min(Math.max(1 - distance / radius, 0), 1);
    if (falloff === 'exponential') return norm ** 2;
    if (falloff === 'gaussian') return Math.exp(-((distance / (radius / 2)) ** 2) / 2);
    return norm;
  };

  useAnimationFrame(() => {
    if (!containerRef?.current) return;
    const { x, y } = mousePositionRef.current;
    if (lastPositionRef.current.x === x && lastPositionRef.current.y === y) return;
    lastPositionRef.current = { x, y };
    const containerRect = containerRef.current.getBoundingClientRect();
    letterRefs.current.forEach((letterRef, index) => {
      if (!letterRef) return;
      const rect = letterRef.getBoundingClientRect();
      const lx = rect.left + rect.width / 2 - containerRect.left;
      const ly = rect.top + rect.height / 2 - containerRect.top;
      const distance = calcDist(mousePositionRef.current.x, mousePositionRef.current.y, lx, ly);
      if (distance >= radius) { letterRef.style.fontVariationSettings = fromFontVariationSettings; return; }
      const falloffValue = calcFalloff(distance);
      const newSettings = parsedSettings.map(({ axis, fromValue, toValue }) => `'${axis}' ${fromValue + (toValue - fromValue) * falloffValue}`).join(', ');
      interpolatedSettingsRef.current[index] = newSettings;
      letterRef.style.fontVariationSettings = newSettings;
    });
  });

  const words = label.split(' ');
  let letterIndex = 0;
  return (
    <span ref={ref} onClick={onClick} style={{ display: 'inline', ...style }} className={className} {...restProps}>
      {words.map((word, wordIndex) => (
        <span key={wordIndex} className="inline-block whitespace-nowrap">
          {word.split('').map(letter => {
            const currentLetterIndex = letterIndex++;
            return (
              <motion.span key={currentLetterIndex} ref={el => { letterRefs.current[currentLetterIndex] = el; }} style={{ display: 'inline-block', fontVariationSettings: interpolatedSettingsRef.current[currentLetterIndex] }} aria-hidden="true">
                {letter}
              </motion.span>
            );
          })}
          {wordIndex < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
});

VariableProximity.displayName = 'VariableProximity';
export default VariableProximity;
