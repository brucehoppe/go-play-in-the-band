import { useEffect, useRef } from "react";
import { drawWaveform } from "../audio/waveform";

const AMBER = "#e8a93a";
const TEAL = "#6fb7a0";

/** A second waveform drawn over the first in teal, its height scaled by `scale` (0..1). */
export interface Overlay {
  peaks: Float32Array | null;
  scale: number;
}

/**
 * Draw `peaks` into a canvas that fills its box, redrawing when the box is resized.
 * A change of `overlay.scale` only redraws; it never recomputes peaks.
 */
export function useWaveCanvas(peaks: Float32Array | null, overlay?: Overlay) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlayPeaks = overlay?.peaks ?? null;
  const overlayScale = overlay?.scale ?? 0;
  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv || !peaks) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      cv.width = Math.max(1, Math.floor(width * dpr));
      cv.height = Math.max(1, Math.floor(height * dpr));
      const ctx = cv.getContext("2d")!;
      drawWaveform(ctx, peaks, cv.width, cv.height, AMBER);
      if (overlayPeaks) drawWaveform(ctx, overlayPeaks, cv.width, cv.height, TEAL, overlayScale, false);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [peaks, overlayPeaks, overlayScale]);
  return { box, canvas };
}
