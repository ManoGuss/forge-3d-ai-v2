import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DoodleCanvasHandle = { exportPng: () => string | null; clear: () => void; undo: () => void; redo: () => void; loadSnapshot: (image: string) => void; canUndo: boolean; canRedo: boolean };

export const DoodleCanvas = forwardRef<DoodleCanvasHandle, { initialSnapshot?: string; onChange?: (snapshot: string) => void }>(function DoodleCanvas({ initialSnapshot, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [brush, setBrush] = useState(7);
  const [color, setColor] = useState("#252a33");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const paintBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height); };
  const snapshot = () => canvasRef.current?.toDataURL("image/png") ?? null;
  const pushHistory = (image: string | null) => { if (!image) return; setHistory(current => [...current.slice(0, historyIndex + 1), image].slice(-40)); setHistoryIndex(current => Math.min(current + 1, 39)); onChange?.(image); };
  const restore = (image: string) => { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return; const img = new Image(); img.onload = () => { const rect = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height); ctx.drawImage(img, 0, 0, rect.width, rect.height); onChange?.(canvas.toDataURL("image/png")); }; img.src = image; };
  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.scale(dpr, dpr); paintBackground(ctx, rect.width, rect.height); if (initialSnapshot) { const image = new Image(); image.onload = () => { ctx.drawImage(image, 0, 0, rect.width, rect.height); const restored = canvas.toDataURL("image/png"); setHistory([restored]); setHistoryIndex(0); }; image.src = initialSnapshot; } else { const initial = canvas.toDataURL("image/png"); setHistory([initial]); setHistoryIndex(0); } }, []);
  const undo = () => { if (historyIndex <= 0) return; const next = historyIndex - 1; setHistoryIndex(next); restore(history[next]); };
  const redo = () => { if (historyIndex >= history.length - 1) return; const next = historyIndex + 1; setHistoryIndex(next); restore(history[next]); };
  const loadSnapshot = (image: string) => { restore(image); setHistory([image]); setHistoryIndex(0); };
  const clear = () => { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return; const rect = canvas.getBoundingClientRect(); paintBackground(ctx, rect.width, rect.height); pushHistory(snapshot()); };
  useImperativeHandle(ref, () => ({ exportPng: snapshot, clear, undo, redo, loadSnapshot, canUndo: historyIndex > 0, canRedo: historyIndex < history.length - 1 }), [history, historyIndex]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const canvas = canvasRef.current; if (!canvas) return null; const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); const p = point(event); if (!ctx || !p) return; canvas?.setPointerCapture(event.pointerId); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.strokeStyle = tool === "erase" ? "#ffffff" : color; ctx.lineWidth = tool === "erase" ? brush * 2.4 : brush; ctx.lineCap = "round"; ctx.lineJoin = "round"; setDrawing(true); };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing) return; const ctx = canvasRef.current?.getContext("2d"); const p = point(event); if (!ctx || !p) return; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const finish = () => { if (!drawing) return; setDrawing(false); pushHistory(snapshot()); };

  return <div className="doodle-sheet"><canvas ref={canvasRef} className="doodle-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onPointerLeave={finish} aria-label="Folha de desenho" /><div className="doodle-toolbar"><div className="doodle-tool-group"><Button size="icon" variant="ghost" onClick={undo} disabled={historyIndex <= 0} aria-label="Desfazer"><Undo2 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={redo} disabled={historyIndex >= history.length - 1} aria-label="Refazer"><Redo2 className="h-4 w-4" /></Button><span className="doodle-divider" /><Button size="icon" variant="ghost" className={tool === "draw" ? "doodle-active" : ""} onClick={() => setTool("draw")} aria-label="Pincel"><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className={tool === "erase" ? "doodle-active" : ""} onClick={() => setTool("erase")} aria-label="Borracha"><Eraser className="h-4 w-4" /></Button><label className="doodle-color"><input aria-label="Cor do pincel" type="color" value={color} onChange={event => setColor(event.target.value)} /></label><input aria-label="Tamanho do pincel" type="range" min="1" max="48" value={brush} onChange={event => setBrush(Number(event.target.value))} /><span>{brush}px</span></div><Button size="icon" variant="ghost" onClick={clear} aria-label="Limpar folha"><Trash2 className="h-4 w-4" /></Button></div></div>;
});
