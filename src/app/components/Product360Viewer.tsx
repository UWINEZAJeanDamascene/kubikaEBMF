import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductImage } from './ProductImage';

interface Product360ViewerProps {
  images?: string[] | null;
  fallbackImageUrl?: string | null;
  alt: string;
  className?: string;
}

/** Drag horizontally to step through a product's ordered 360-degree photo set. */
export function Product360Viewer({ images, fallbackImageUrl, alt, className = '' }: Product360ViewerProps) {
  const frames = useMemo(() => (Array.isArray(images) ? images.filter((url) => typeof url === 'string' && url.trim()).map((url) => url.trim()) : []), [images]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [frameFailed, setFrameFailed] = useState(false);
  const pointerRef = useRef<{ id: number; lastX: number; remainder: number; distance: number } | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => setFrameIndex(0), [frames]);
  useEffect(() => setFrameFailed(false), [frameIndex, frames]);

  if (frames.length < 2) {
    return <ProductImage src={frames[0] || fallbackImageUrl} alt={alt} className={className} />;
  }
  if (frameFailed) return <ProductImage src={fallbackImageUrl} alt={alt} className={className} />;

  const activeFrame = frames[frameIndex % frames.length];
  return (
    <div
      className={`group relative touch-pan-y select-none overflow-hidden ${className}`}
      role="img"
      aria-label={`${alt}, interactive 360-degree product view. Drag horizontally to rotate.`}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        draggedRef.current = false;
        pointerRef.current = { id: event.pointerId, lastX: event.clientX, remainder: 0, distance: 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const pointer = pointerRef.current;
        if (!pointer || pointer.id !== event.pointerId) return;
        const delta = event.clientX - pointer.lastX;
        pointer.lastX = event.clientX;
        pointer.distance += Math.abs(delta);
        if (pointer.distance > 5) draggedRef.current = true;
        pointer.remainder += delta;
        const frameStep = Math.trunc(pointer.remainder / 6);
        if (frameStep) {
          pointer.remainder -= frameStep * 6;
          setFrameIndex((current) => ((current - frameStep) % frames.length + frames.length) % frames.length);
        }
      }}
      onPointerUp={() => { pointerRef.current = null; }}
      onPointerCancel={() => { pointerRef.current = null; }}
      onClick={(event) => {
        if (!draggedRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        draggedRef.current = false;
      }}
    >
      <img
        src={activeFrame}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-full w-full rounded-md object-contain"
        onError={() => setFrameFailed(true)}
      />
      <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-medium text-white opacity-90 shadow-sm">
        Drag to rotate · {frameIndex + 1}/{frames.length}
      </span>
    </div>
  );
}
