import { useEffect, useRef } from "react";
import { drawWaveform } from "../audio/waveform";

const AMBER = "#e8a93a";

/** Draw `peaks` into a canvas that fills its box, redrawing when the box is resized. */
export function useWaveCanvas(peaks: Float32Array | null) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv || !peaks) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      cv.width = Math.max(1, Math.floor(width * dpr));
      cv.height = Math.max(1, Math.floor(height * dpr));
      drawWaveform(cv.getContext("2d")!, peaks, cv.width, cv.height, AMBER);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [peaks]);
  return { box, canvas };
}
