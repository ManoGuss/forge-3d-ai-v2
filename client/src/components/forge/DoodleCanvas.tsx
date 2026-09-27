import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DoodleCanvasHandle = { exportPng: () => string | null; clear: () => void };

export const DoodleCanvas = forwardRef<DoodleCanvasHandle>(function DoodleCanvas(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [brush, setBrush] = useState(7);
  const [color, setColor] = useState("#d7ff48");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#111824";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "rgba(215,255,72,.08)";
    ctx.lineWidth = 1;
    for (let x = 24; x < rect.width; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); }
    for (let y = 24; y < rect.height; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); }
  }, []);

  useImperativeHandle(ref, () => ({
    exportPng: () => canvasRef.current?.toDataURL("image/png") ?? null,
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.fillStyle = "#111824";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    },
  }), []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const p = point(event);
    if (!ctx || !p) return;
    canvas?.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.strokeStyle = tool === "erase" ? "#111824" : color;
    ctx.lineWidth = tool === "erase" ? brush * 2.3 : brush;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setDrawing(true);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    const p = point(event);
    if (!ctx || !p) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111824]">
      <canvas ref={canvasRef} className="h-[220px] w-full touch-none" onPointerDown={start} onPointerMove={move} onPointerUp={() => setDrawing(false)} onPointerLeave={() => setDrawing(false)} aria-label="Doodle canvas" />
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl border border-white/10 bg-[#0b1017]/90 px-2 py-1.5 backdrop-blur">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className={tool === "draw" ? "bg-[#d7ff48]/15 text-[#d7ff48]" : "text-white/50"} onClick={() => setTool("draw")} aria-label="Draw"><RotateCcw className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className={tool === "erase" ? "bg-[#d7ff48]/15 text-[#d7ff48]" : "text-white/50"} onClick={() => setTool("erase")} aria-label="Erase"><Eraser className="h-3.5 w-3.5" /></Button>
          <input aria-label="Brush size" type="range" min="2" max="32" value={brush} onChange={event => setBrush(Number(event.target.value))} className="ml-2 w-20 accent-[#d7ff48]" />
          <span className="text-[9px] text-white/35">{brush}px</span>
          <input aria-label="Brush color" type="color" value={color} onChange={event => setColor(event.target.value)} className="ml-1 h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
        </div>
        <Button size="icon" variant="ghost" className="text-white/45 hover:text-red-300" onClick={() => { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (canvas && ctx) { ctx.fillStyle = "#111824"; ctx.fillRect(0, 0, canvas.width, canvas.height); } }} aria-label="Clear doodle"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
});
