import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Redo2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DoodleCanvasHandle = { exportPng: () => string | null; clear: () => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };

export const DoodleCanvas = forwardRef<DoodleCanvasHandle>(function DoodleCanvas(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [brush, setBrush] = useState(7);
  const [color, setColor] = useState("#d7ff48");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const beforeStroke = useRef<string | null>(null);

  const paintBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = "#111824"; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = "rgba(215,255,72,.08)"; ctx.lineWidth = 1;
    for (let x = 24; x < width; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 24; y < height; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  };
  const snapshot = () => canvasRef.current?.toDataURL("image/png") ?? null;
  const pushHistory = (image: string | null) => { if (!image) return; setHistory(current => [...current.slice(0, historyIndex + 1), image].slice(-40)); setHistoryIndex(current => Math.min(current + 1, 39)); };
  const restore = (image: string) => { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return; const img = new Image(); img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }; img.src = image; };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const dpr = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect(); canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.scale(dpr, dpr); paintBackground(ctx, rect.width, rect.height); const initial = canvas.toDataURL("image/png"); setHistory([initial]); setHistoryIndex(0);
  }, []);

  const undo = () => { if (historyIndex <= 0) return; const next = historyIndex - 1; setHistoryIndex(next); restore(history[next]); };
  const redo = () => { if (historyIndex >= history.length - 1) return; const next = historyIndex + 1; setHistoryIndex(next); restore(history[next]); };
  const clear = () => { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return; const rect = canvas.getBoundingClientRect(); paintBackground(ctx, rect.width, rect.height); pushHistory(snapshot()); };
  useImperativeHandle(ref, () => ({ exportPng: snapshot, clear, undo, redo, canUndo: historyIndex > 0, canRedo: historyIndex < history.length - 1 }), [history, historyIndex]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const canvas = canvasRef.current; if (!canvas) return null; const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); const p = point(event); if (!ctx || !p) return; canvas?.setPointerCapture(event.pointerId); beforeStroke.current = snapshot(); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.strokeStyle = tool === "erase" ? "#111824" : color; ctx.lineWidth = tool === "erase" ? brush * 2.3 : brush; ctx.lineCap = "round"; ctx.lineJoin = "round"; setDrawing(true); };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing) return; const ctx = canvasRef.current?.getContext("2d"); const p = point(event); if (!ctx || !p) return; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const finish = () => { if (!drawing) return; setDrawing(false); pushHistory(snapshot()); beforeStroke.current = null; };

  return <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111824]"><canvas ref={canvasRef} className="h-[220px] w-full touch-none" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onPointerLeave={finish} aria-label="Doodle canvas" /><div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl border border-white/10 bg-[#0b1017]/90 px-2 py-1.5 backdrop-blur"><div className="flex items-center gap-1"><Button size="icon" variant="ghost" className="text-white/50 hover:text-white disabled:opacity-30" onClick={undo} disabled={historyIndex <= 0} aria-label="Undo"><Undo2 className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="text-white/50 hover:text-white disabled:opacity-30" onClick={redo} disabled={historyIndex >= history.length - 1} aria-label="Redo"><Redo2 className="h-3.5 w-3.5" /></Button><span className="mx-1 h-5 w-px bg-white/10" /><Button size="icon" variant="ghost" className={tool === "draw" ? "bg-[#d7ff48]/15 text-[#d7ff48]" : "text-white/50"} onClick={() => setTool("draw")} aria-label="Draw"><RotateCcw className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className={tool === "erase" ? "bg-[#d7ff48]/15 text-[#d7ff48]" : "text-white/50"} onClick={() => setTool("erase")} aria-label="Erase"><Eraser className="h-3.5 w-3.5" /></Button><input aria-label="Brush size" type="range" min="2" max="32" value={brush} onChange={event => setBrush(Number(event.target.value))} className="ml-2 w-20 accent-[#d7ff48]" /><span className="text-[9px] text-white/35">{brush}px</span><input aria-label="Brush color" type="color" value={color} onChange={event => setColor(event.target.value)} className="ml-1 h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" /></div><Button size="icon" variant="ghost" className="text-white/45 hover:text-red-300" onClick={clear} aria-label="Clear doodle"><Trash2 className="h-3.5 w-3.5" /></Button></div></div>;
});
