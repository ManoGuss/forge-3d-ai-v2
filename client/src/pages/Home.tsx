import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DoodleCanvas, type DoodleCanvasHandle } from "@/components/forge/DoodleCanvas";
import { ForgeViewport, type ExportFormat, type ForgeViewportHandle, type TransformMode } from "@/components/forge/ForgeViewport";
import { trpc } from "@/lib/trpc";
import { ArrowDownToLine, Box, ChevronDown, Clock3, Download, Eye, EyeOff, FolderOpen, History, ImagePlus, Layers3, Loader2, Menu, Move3D, Pause, Play, Plus, Redo2, Rotate3D, Save, Search, Send, Settings2, Sparkles, Square, Trash2, Undo2, Upload, WandSparkles, X } from "lucide-react";

const styles = ["Realistic", "Stylized", "Low Poly", "Anime", "Fantasy", "Sci-Fi", "Cyberpunk", "Game Ready"];
type Reference = { id: string; name: string; dataUrl: string; mimeType: string; uploadedUrl?: string };
type JobHistory = { id: string; prompt: string; status: "queued" | "processing" | "completed" | "failed" | "cancelled"; progress: number; stage: string; createdAt: string; error?: string; conceptUrl?: string; modelUrl?: string };
type TransformSnapshot = { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] };

function dataUrlToBase64(dataUrl: string) { return dataUrl.split(",")[1] ?? ""; }

export default function Home() {
  const { user } = useAuth();
  const [projectName, setProjectName] = useState("Cybernetic Explorer");
  const [prompt, setPrompt] = useState("Um robô explorador futurista com corpo compacto, mochila de energia e duas pernas mecânicas.");
  const [style, setStyle] = useState("Sci-Fi");
  const [references, setReferences] = useState<Reference[]>([]);
  const [conceptUrl, setConceptUrl] = useState<string>();
  const [stage, setStage] = useState<"idea" | "concept" | "model">("idea");
  const [activeResult, setActiveResult] = useState<"concept" | "viewport">("concept");
  const [wireframe, setWireframe] = useState(false);
  const [lightPower, setLightPower] = useState(2.2);
  const [materialColor, setMaterialColor] = useState("#9aa7b8");
  const [environment, setEnvironment] = useState<"studio" | "sunset" | "night">("studio");
  const [importedUrl, setImportedUrl] = useState<string>();
  const [selectedName, setSelectedName] = useState("Scene");
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D>();
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [transform, setTransform] = useState<TransformSnapshot>({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  const [history, setHistory] = useState<JobHistory[]>([]);
  const [activeJobId, setActiveJobId] = useState<string>();
  const [showHistory, setShowHistory] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [generationMessage, setGenerationMessage] = useState("Ready to create");
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStage, setJobStage] = useState("Awaiting input");
  const [progressiveModelUrl, setProgressiveModelUrl] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const doodleRef = useRef<DoodleCanvasHandle>(null);
  const viewportRef = useRef<ForgeViewportHandle>(null);

  const providers = trpc.providers.status.useQuery();
  const uploadReference = trpc.assets.uploadReference.useMutation();
  const generateConcept = trpc.forge.generateConcept.useMutation();
  const generate3D = trpc.forge.generate3D.useMutation();
  const cancelJob = trpc.forge.cancelJob.useMutation();
  const jobStatus = trpc.forge.jobStatus.useQuery({ jobId: activeJobId ?? "pending" }, { enabled: Boolean(activeJobId), refetchInterval: query => query.state.data?.status === "completed" || query.state.data?.status === "failed" || query.state.data?.status === "cancelled" ? false : 1200 });

  const snapshot = (object?: THREE.Object3D): TransformSnapshot => object ? { position: [object.position.x, object.position.y, object.position.z], rotation: [object.rotation.x, object.rotation.y, object.rotation.z], scale: [object.scale.x, object.scale.y, object.scale.z] } : transform;
  const updateTransform = (object?: THREE.Object3D) => { setSelectedObject(object); if (object) setTransform(snapshot(object)); };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      if (key === "g") { setTransformMode("translate"); toast("Move gizmo active"); }
      if (key === "r") { setTransformMode("rotate"); toast("Rotate gizmo active"); }
      if (key === "s") { setTransformMode("scale"); toast("Scale gizmo active"); }
      if (key === "h") setShowHistory(value => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const data = jobStatus.data;
    if (!data || !activeJobId) return;
    setJobProgress(data.progress ?? 0); setJobStage(data.stage ?? data.status); setGenerationMessage(data.status === "completed" ? "Model ready" : data.status === "failed" ? "Generation failed" : data.status === "cancelled" ? "Job cancelled" : "Generating model");
    setHistory(current => current.map(item => item.id === activeJobId ? { ...item, status: data.status, progress: data.progress ?? item.progress, stage: data.stage ?? item.stage, error: data.error, modelUrl: data.modelUrl ?? item.modelUrl } : item));
    if (data.modelUrl) { setProgressiveModelUrl(data.modelUrl); setImportedUrl(data.modelUrl); setActiveResult("viewport"); }
    if (data.status === "completed") { setStage("model"); setActiveResult("viewport"); }
  }, [jobStatus.data, activeJobId]);

  const addReference = (file: File) => { const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") setReferences(current => [...current, { id: crypto.randomUUID(), name: file.name, dataUrl: reader.result as string, mimeType: file.type || "image/png" }].slice(-6)); }; reader.readAsDataURL(file); };

  const handleGenerateConcept = async () => {
    if (!prompt.trim()) { toast.error("Escreva uma ideia antes de gerar."); return; }
    try {
      const refs: Array<{ url?: string; b64Json?: string; mimeType?: string }> = [];
      for (const reference of references) { const uploaded = await uploadReference.mutateAsync({ dataUrl: reference.dataUrl, filename: reference.name, mimeType: reference.mimeType }); refs.push({ url: uploaded.url, b64Json: dataUrlToBase64(reference.dataUrl), mimeType: reference.mimeType }); }
      const doodle = doodleRef.current?.exportPng();
      if (doodle) { const uploaded = await uploadReference.mutateAsync({ dataUrl: doodle, filename: "idea-doodle.png", mimeType: "image/png" }); refs.push({ url: uploaded.url, b64Json: dataUrlToBase64(doodle), mimeType: "image/png" }); }
      setGenerationMessage("AI is interpreting your idea…");
      const result = await generateConcept.mutateAsync({ projectName, prompt, style, originalImages: refs });
      setConceptUrl(result.url); setStage("concept"); setActiveResult("concept"); setGenerationMessage("Concept ready"); toast.success("Concept generated");
    } catch (error) { setGenerationMessage("Generation failed"); toast.error(error instanceof Error ? error.message : "Concept generation failed"); }
  };

  const handleGenerate3D = async () => {
    if (!conceptUrl) { toast.error("Gere um conceito antes do modelo 3D."); return; }
    try {
      setGenerationMessage("Submitting 3D job…");
      const job = await generate3D.mutateAsync({ prompt, conceptUrl, polygonCount: "20K", textureQuality: "High" });
      setActiveJobId(job.jobId); setJobProgress(job.progress ?? 4); setJobStage(job.stage ?? "Job accepted"); setProgressiveModelUrl(job.modelUrl); if (job.modelUrl) setImportedUrl(job.modelUrl);
      setHistory(current => [{ id: job.jobId, prompt, status: job.status, progress: job.progress ?? 4, stage: job.stage ?? "Job accepted", createdAt: new Date().toLocaleTimeString(), conceptUrl }, ...current]);
      setShowHistory(true); toast.success("3D job started");
    } catch (error) { setGenerationMessage("3D provider unavailable"); toast.error(error instanceof Error ? error.message : "3D generation unavailable", { description: "Nenhum modelo falso foi criado." }); }
  };

  const handleCancel = async (jobId: string) => { try { await cancelJob.mutateAsync({ jobId }); setHistory(current => current.map(item => item.id === jobId ? { ...item, status: "cancelled", stage: "Cancelled", progress: 0 } : item)); if (jobId === activeJobId) setGenerationMessage("Job cancelled"); toast("Generation cancelled"); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not cancel job"); } };
  const retryJob = (job: JobHistory) => { setPrompt(job.prompt); setConceptUrl(job.conceptUrl); setActiveResult("concept"); setGenerationMessage("Ready to retry"); toast("Prompt restored", { description: "Review the prompt and start a new 3D job." }); };
  const handleExport = async (format: ExportFormat) => { try { await viewportRef.current?.export(format); toast.success(`${format.toUpperCase()} downloaded`); } catch (error) { toast.error(error instanceof Error ? error.message : "Export failed"); } };
  const handleImport = (file?: File) => { if (!file) return; setImportedUrl(URL.createObjectURL(file)); setStage("model"); setActiveResult("viewport"); toast.success("3D asset loaded"); };
  const setNumeric = (kind: "position" | "rotation" | "scale", axisIndex: 0 | 1 | 2, value: number) => { const axis = (["x", "y", "z"] as const)[axisIndex]; viewportRef.current?.setTransform(kind, axis, value); setTransform(current => ({ ...current, [kind]: current[kind].map((item, index) => index === axisIndex ? value : item) as [number, number, number] })); };

  return <div className="min-h-screen bg-[#080b10] text-[#f2f5f7]">
    <header className="flex h-[66px] items-center justify-between border-b border-white/8 bg-[#0b1017] px-4 md:px-6"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenu(true)}><Menu className="h-5 w-5" /></Button><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#d7ff48] text-[#10140c]"><Sparkles className="h-4 w-4" /></div><div><div className="text-sm font-black tracking-[.18em]">FORGE<span className="text-[#d7ff48]">³</span>D</div><div className="text-[9px] font-bold uppercase tracking-[.22em] text-white/35">IDEA FORGE WORKSPACE</div></div></div><div className="hidden items-center gap-2 md:flex"><button className="forge-ghost"><Plus className="h-3.5 w-3.5" /> New idea</button><button className="icon-button"><Undo2 className="h-4 w-4" /></button><button className="icon-button"><Redo2 className="h-4 w-4" /></button><button className="forge-ghost"><Save className="h-3.5 w-3.5" /> Save</button></div><div className="flex items-center gap-2"><Badge className="hidden border-white/10 bg-white/[.03] text-[10px] uppercase tracking-widest text-white/45 sm:flex"><span className="mr-2 h-1.5 w-1.5 rounded-full bg-[#d7ff48]" />AI {providers.data?.image.configured ? "online" : "setup"}</Badge><button onClick={() => handleExport("glb")} className="forge-primary"><ArrowDownToLine className="h-3.5 w-3.5" /> Export</button>{user ? <div className="grid h-8 w-8 place-items-center rounded-full bg-[#31404d] text-xs font-bold">{user.name?.slice(0, 1) ?? "U"}</div> : <button onClick={() => startLogin()} className="icon-button"><FolderOpen className="h-4 w-4" /></button>}</div></header>

    <main className="mx-auto grid min-h-[calc(100vh-66px)] max-w-[1680px] grid-cols-1 lg:grid-cols-[minmax(320px,.78fr)_minmax(420px,1.45fr)_280px]">
      <section className="border-b border-white/8 bg-[#0b1017] p-4 md:p-6 lg:border-b-0 lg:border-r"><div className="mb-5 flex items-start justify-between"><div><div className="eyebrow">IDEA FORGE</div><h1 className="mt-1 text-2xl font-bold tracking-tight">Turn a sketch into a world.</h1><p className="mt-1 text-xs leading-5 text-white/35">Draw, describe and watch the idea take shape.</p></div><kbd className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/35">⌘ ↵</kbd></div><div className="mb-4 flex items-center gap-1 rounded-xl border border-white/8 bg-white/[.025] p-1"><button className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white">Create</button><button onClick={() => setShowHistory(value => !value)} className="flex-1 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/35 hover:text-white">History <span className="text-[#d7ff48]">{history.length}</span></button></div><div className="space-y-4"><div className="rounded-2xl border border-white/10 bg-[#111824] p-3"><div className="mb-2 flex items-center justify-between"><span className="section-label">Describe your idea</span><span className="text-[10px] text-white/25">PT / EN</span></div><Textarea value={prompt} onChange={event => setPrompt(event.target.value)} className="min-h-[112px] resize-none border-0 bg-transparent p-0 text-sm leading-6 text-white shadow-none focus-visible:ring-0" placeholder="Describe what you want to generate…" /><div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/8 pt-3"><button onClick={() => setStyle("Sci-Fi")} className="tool-pill"><Sparkles className="h-3 w-3" /> Style</button><button onClick={() => fileInputRef.current?.click()} className="tool-pill"><ImagePlus className="h-3 w-3" /> Add image</button><button className="tool-pill text-[#d7ff48]"><PenIcon /> Doodle</button><button className="tool-pill" onClick={() => toast("Asset Pack is queued for the next phase")}><Layers3 className="h-3 w-3" /> Asset Pack</button><input ref={fileInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp" multiple onChange={event => Array.from(event.target.files ?? []).forEach(addReference)} /></div></div><div><div className="mb-2 flex items-center justify-between"><span className="section-label">Doodle canvas</span><span className="text-[10px] text-white/25">draw with mouse / pen</span></div><DoodleCanvas ref={doodleRef} /></div><div><div className="mb-2 flex items-center justify-between"><span className="section-label">Style direction</span><span className="text-[10px] text-[#d7ff48]">{style}</span></div><div className="flex flex-wrap gap-1.5">{styles.map(item => <button key={item} onClick={() => setStyle(item)} className={`chip ${style === item ? "chip-active" : ""}`}>{item}</button>)}</div></div>{references.length > 0 && <div className="flex gap-2 overflow-x-auto">{references.map(reference => <div key={reference.id} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10"><img src={reference.dataUrl} alt={reference.name} className="h-full w-full object-cover" /><button onClick={() => setReferences(current => current.filter(item => item.id !== reference.id))} className="absolute right-1 top-1 rounded bg-black/60 p-0.5"><X className="h-3 w-3" /></button></div>)}</div>}<button onClick={handleGenerateConcept} disabled={generateConcept.isPending || uploadReference.isPending} className="forge-generate">{generateConcept.isPending || uploadReference.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generateConcept.isPending ? "Generating concept…" : "Generate concept"}<span className="ml-auto text-[10px] uppercase tracking-widest opacity-60">↵</span></button></div></section>

      <section className="min-w-0 bg-[#080b10] p-4 md:p-6"><div className="mb-4 flex items-center justify-between"><div><div className="eyebrow">AI OUTPUT</div><div className="mt-1 flex items-center gap-2"><h2 className="text-lg font-bold">{projectName}</h2><span className="h-1.5 w-1.5 rounded-full bg-[#d7ff48]" /><span className="text-[10px] text-white/35">{generationMessage}</span></div></div><div className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/[.02] p-1"><button onClick={() => setActiveResult("concept")} className={`result-tab ${activeResult === "concept" ? "result-tab-active" : ""}`}>Concept</button><button onClick={() => setActiveResult("viewport")} className={`result-tab ${activeResult === "viewport" ? "result-tab-active" : ""}`}>3D Viewport</button></div></div><div className="mb-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#d7ff48] transition-all" style={{ width: `${stage === "idea" ? 8 : stage === "concept" ? 42 : Math.max(jobProgress, 80)}%` }} /></div><div className="text-[10px] font-bold text-white/45">{jobProgress > 0 ? `${Math.round(jobProgress)}%` : stage === "idea" ? "Ready" : "Concept"}</div></div>{activeResult === "concept" ? <div className="flex min-h-[610px] items-center justify-center rounded-3xl border border-white/10 bg-[#111824] p-4">{conceptUrl ? <img src={conceptUrl} alt="AI generated concept" className="max-h-[580px] w-full rounded-2xl object-contain" /> : <div className="text-center"><div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[.03] text-white/25"><Sparkles className="h-7 w-7" /></div><div className="text-sm font-semibold text-white/45">Your result will appear here</div><div className="mt-2 text-xs text-white/25">Generate a concept from your prompt and doodle.</div></div>}</div> : <div className="relative min-h-[610px]"><ForgeViewport ref={viewportRef} wireframe={wireframe} lightPower={lightPower} materialColor={materialColor} environment={environment} importedUrl={importedUrl} transformMode={transformMode} onSelectionChange={(name, object) => { setSelectedName(name); updateTransform(object); }} onTransformChange={object => updateTransform(object)} /><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setTransformMode("translate")} className={`gizmo-pill ${transformMode === "translate" ? "gizmo-pill-active" : ""}`}>G Move</button><button onClick={() => setTransformMode("rotate")} className={`gizmo-pill ${transformMode === "rotate" ? "gizmo-pill-active" : ""}`}>R Rotate</button><button onClick={() => setTransformMode("scale")} className={`gizmo-pill ${transformMode === "scale" ? "gizmo-pill-active" : ""}`}>S Scale</button><button onClick={() => setWireframe(value => !value)} className="gizmo-pill">Wireframe</button><button onClick={() => modelInputRef.current?.click()} className="gizmo-pill"><Upload className="h-3 w-3" /> Import 3D</button><input ref={modelInputRef} type="file" className="hidden" accept=".glb,.gltf" onChange={event => handleImport(event.target.files?.[0])} /></div></div>}{conceptUrl && activeResult === "concept" && <button onClick={handleGenerate3D} disabled={generate3D.isPending} className="forge-primary mt-4 w-full justify-center">{generate3D.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Box className="h-4 w-4" />}{generate3D.isPending ? "Starting 3D job…" : "Make 3D from concept"}<span className="ml-auto text-[10px] opacity-60">Provider job + polling</span></button>}</section>

      <aside className="border-t border-white/8 bg-[#0b1017] p-4 md:p-6 lg:border-l lg:border-t-0"><div className="mb-5 flex items-center justify-between"><div><div className="eyebrow">INSPECTOR</div><h2 className="mt-1 text-lg font-bold">{selectedName}</h2></div><button className="icon-button"><Settings2 className="h-4 w-4" /></button></div><div className="space-y-4"><div className="rounded-2xl border border-white/8 bg-white/[.02] p-3"><div className="mb-3 flex items-center gap-2"><Move3D className="h-4 w-4 text-[#d7ff48]" /><span className="section-label">Transform</span></div>{(["position", "rotation", "scale"] as const).map(kind => <div key={kind} className="mb-3 last:mb-0"><div className="mb-1.5 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-white/45">{kind}</span><span className="text-[9px] text-white/20">{kind === "rotation" ? "rad" : "units"}</span></div><div className="grid grid-cols-3 gap-1.5">{transform[kind].map((value, index) => <label key={`${kind}-${index}`} className="relative"><span className={`absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold ${index === 0 ? "text-red-300" : index === 1 ? "text-green-300" : "text-blue-300"}`}>{["X", "Y", "Z"][index]}</span><input type="number" step="0.01" value={Number(value.toFixed(2))} onChange={event => setNumeric(kind, index as 0 | 1 | 2, Number(event.target.value))} className="inspector-input pl-6" /></label>)}</div></div>)}</div><div className="rounded-2xl border border-white/8 bg-white/[.02] p-3"><div className="mb-3 flex items-center justify-between"><span className="section-label">Environment</span><span className="text-[10px] text-[#d7ff48]">LIVE</span></div><div className="grid grid-cols-3 gap-1.5">{(["studio", "sunset", "night"] as const).map(item => <button key={item} onClick={() => setEnvironment(item)} className={`preset ${environment === item ? "preset-active" : ""}`}><span className={`mb-1.5 block h-7 rounded-md ${item === "studio" ? "bg-gradient-to-br from-[#526276] to-[#dce2ec]" : item === "sunset" ? "bg-gradient-to-br from-[#f79853] to-[#342134]" : "bg-gradient-to-br from-[#172440] to-[#05070d]"}`} /><span className="text-[9px] capitalize">{item}</span></button>)}</div><div className="mt-3"><div className="mb-1 flex justify-between text-[10px] text-white/40"><span>Key light</span><span>{lightPower.toFixed(1)}</span></div><input type="range" min=".4" max="4" step=".1" value={lightPower} onChange={event => setLightPower(Number(event.target.value))} className="w-full accent-[#d7ff48]" /></div></div><div className="flex gap-1.5"><button onClick={() => handleExport("obj")} className="small-action flex-1"><Download className="h-3.5 w-3.5" /> OBJ</button><button onClick={() => handleExport("fbx")} className="small-action flex-1"><Download className="h-3.5 w-3.5" /> FBX</button></div><div className="border-t border-white/8 pt-4"><button onClick={() => setShowHistory(value => !value)} className="mb-2 flex w-full items-center justify-between"><span className="section-label">Generation history</span><ChevronDown className={`h-4 w-4 text-white/35 transition ${showHistory ? "rotate-180" : ""}`} /></button>{showHistory && <div className="space-y-2">{history.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-3 text-center text-[10px] text-white/25">Jobs will appear here</div> : history.map(job => <div key={job.id} className={`rounded-xl border p-2.5 ${job.id === activeJobId ? "border-[#d7ff48]/30 bg-[#d7ff48]/[.04]" : "border-white/8 bg-white/[.02]"}`}><div className="flex items-start gap-2"><div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${job.status === "completed" ? "bg-[#d7ff48]" : job.status === "failed" ? "bg-red-400" : job.status === "cancelled" ? "bg-white/30" : "bg-amber-300 animate-pulse"}`} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2">{job.conceptUrl && <img src={job.conceptUrl} alt="Job preview" className="h-7 w-7 rounded-md object-cover" />}<div className="truncate text-[10px] font-semibold text-white/75">{job.prompt}</div></div><div className="mt-1 flex justify-between text-[9px] text-white/30"><span>{job.stage}</span><span>{job.progress}%</span></div>{job.id === activeJobId && progressiveModelUrl && <div className="mt-1 text-[9px] text-[#d7ff48]">Live preview updated</div>}{(job.status === "queued" || job.status === "processing") && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#d7ff48]" style={{ width: `${job.progress}%` }} /></div>}</div></div><div className="mt-2 flex items-center gap-1">{(job.status === "queued" || job.status === "processing") && <button onClick={() => handleCancel(job.id)} className="history-action text-red-300"><Square className="h-3 w-3" /> Cancel</button>}{job.status === "failed" || job.status === "cancelled" ? <button onClick={() => retryJob(job)} className="history-action text-[#d7ff48]"><Rotate3D className="h-3 w-3" /> Retry</button> : null}</div></div>)}</div>}</div></div></aside>
    </main>
    {mobileMenu && <div className="fixed inset-0 z-50 bg-black/60 p-4 backdrop-blur-sm" onClick={() => setMobileMenu(false)}><div className="w-64 rounded-2xl border border-white/10 bg-[#111824] p-4" onClick={event => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-widest text-white/40">Workspace</span><Button variant="ghost" size="icon" onClick={() => setMobileMenu(false)}><X className="h-4 w-4" /></Button></div><button className="nav-item nav-item-active"><Sparkles className="h-4 w-4" /> Idea Forge</button><button className="nav-item"><History className="h-4 w-4" /> History</button></div></div>}
  </div>;
}

function PenIcon() { return <span className="text-[11px]">✎</span>; }
