import { useRef, useState, type ReactNode } from 'react';

const THRESHOLD = 80;

/**
 * Ligne qu'on fait glisser : à gauche pour une action (ex. « Fini »), à droite pour une autre (ex. « Racheté »).
 * Le défilement vertical reste libre ; un simple toucher garde le comportement normal de la ligne.
 */
export function SwipeRow({ children, left, right }: { children: ReactNode; left?: { label: string; run: () => void }; right?: { label: string; run: () => void } }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const horizontal = useRef(false);

  const clamp = (v: number) => Math.max(left ? -140 : 0, Math.min(right ? 140 : 0, v));

  return (
    <div className="swipe-row">
      {right && <div className={`swipe-bg swipe-right ${dx >= THRESHOLD ? 'is-armed' : ''}`}>{right.label}</div>}
      {left && <div className={`swipe-bg swipe-left ${dx <= -THRESHOLD ? 'is-armed' : ''}`}>{left.label}</div>}
      <div
        className="swipe-front"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform 0.2s ease' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          horizontal.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!horizontal.current) {
            if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
              start.current = null; // défilement vertical
              return;
            }
            if (Math.abs(mx) < 10) return;
            horizontal.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          setDx(clamp(mx));
        }}
        onPointerUp={() => {
          if (horizontal.current) {
            if (dx <= -THRESHOLD) left?.run();
            else if (dx >= THRESHOLD) right?.run();
          }
          start.current = null;
          setDx(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
        onClickCapture={(e) => {
          // Un glissement n'est pas un toucher sur les boutons de la ligne.
          if (horizontal.current) {
            e.stopPropagation();
            e.preventDefault();
            horizontal.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
