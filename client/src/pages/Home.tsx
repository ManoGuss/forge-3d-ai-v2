import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DoodleCanvas, type DoodleCanvasHandle } from "@/components/forge/DoodleCanvas";
import { ForgeViewport, type ForgeViewportHandle } from "@/components/forge/ForgeViewport";
import { trpc } from "@/lib/trpc";
import { ArrowDownToLine, Box, BrainCircuit, Check, ChevronDown, CircleHelp, Clock3, Code2, Command, Download, FolderOpen, GalleryVerticalEnd, Grid3X3, History, ImagePlus, Layers3, Lightbulb, Loader2, Menu, Moon, MoreHorizontal, PackageOpen, PanelLeft, Play, Plus, Redo2, Rotate3D, Save, Search, Settings2, Sparkles, Sun, Trash2, Undo2, Upload, WandSparkles, X, Zap } from "lucide-react";

const styles = ["Realistic", "Stylized", "Low Poly", "Anime", "Fantasy", "Sci-Fi", "Cyberpunk", "Game Ready"];
const toolItems = [
  { id: "forge", label: "Idea Forge", icon: WandSparkles },
  { id: "library", label: "Asset Library", icon: GalleryVerticalEnd },
  { id: "scenes", label: "Scenes", icon: Layers3 },
  { id: "history", label: "History", icon: History },
];

type Reference = { id: string; name: string; type: string; dataUrl: string; mimeType: string; uploadedUrl?: string };

function dataUrlToBase64(dataUrl: string) { return dataUrl.split(",")[1] ?? ""; }

export default function Home() {
  const { user } = useAuth();
  const [projectName, setProjectName] = useState("Cybernetic Explorer");
  const [prompt, setPrompt] = useState("Um robô explorador futurista com corpo compacto, mochila de energia e duas pernas mecânicas.");
  const [style, setStyle] = useState("Sci-Fi");
  const [references, setReferences] = useState<Reference[]>([]);
  const [projectId, setProjectId] = useState<number | undefined>();
  const [conceptUrl, setConceptUrl] = useState<string>();
  const [stage, setStage] = useState<"idea" | "concept" | "model">("idea");
  const [activeTool, setActiveTool] = useState("forge");
  const [activeTab, setActiveTab] = useState<"prompt" | "references">("prompt");
  const [wireframe, setWireframe] = useState(false);
  const [lightPower, setLightPower] = useState(2.2);
  const [materialColor, setMaterialColor] = useState("#9aa7b8");
  const [environment, setEnvironment] = useState<"studio" | "sunset" | "night">("studio");
  const [importedUrl, setImportedUrl] = useState<string>();
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generationMessage, setGenerationMessage] = useState("Ready to forge");
  const [modelConfig, setModelConfig] = useState({ polygonCount: "20K", textureQuality: "High" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const doodleRef = useRef<DoodleCanvasHandle>(null);
  const viewportRef = useRef<ForgeViewportHandle>(null);

  const providers = trpc.providers.status.useQuery();
  const createProject = trpc.projects.create.useMutation();
  const uploadReference = trpc.assets.uploadReference.useMutation();
  const generateConcept = trpc.forge.generateConcept.useMutation();
  const generate3D = trpc.forge.generate3D.useMutation();

  const refsCount = references.length;
  const stageLabel = useMemo(() => stage === "idea" ? "01 / Idea" : stage === "concept" ? "02 / Concept" : "03 / Model", [stage]);

  const notifyComingSoon = (label: string) => toast(`${label} is staged for Phase 2`, { description: "A interface está pronta para receber a integração sem apresentar uma ação falsa." });

  const newIdea = () => {
    setPrompt(""); setConceptUrl(undefined); setReferences([]); setStage("idea"); setGenerationMessage("Ready to forge");
    toast.success("New idea started");
  };

  const addReference = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setReferences(current => [...current, { id: crypto.randomUUID(), name: file.name, type: "Style Reference", dataUrl: reader.result as string, mimeType: file.type || "image/png" }].slice(-6));
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Descreva a ideia antes de gerar."); return; }
    setGenerationMessage("Uploading inputs…");
    try {
      const uploadedRefs: Array<{ url?: string; b64Json?: string; mimeType?: string }> = [];
      for (const reference of references) {
        let uploadedUrl = reference.uploadedUrl;
        if (!uploadedUrl) {
          const uploaded = await uploadReference.mutateAsync({ dataUrl: reference.dataUrl, filename: reference.name, mimeType: reference.mimeType });
          uploadedUrl = uploaded.url;
          setReferences(current => current.map(item => item.id === reference.id ? { ...item, uploadedUrl } : item));
        }
        uploadedRefs.push({ url: uploadedUrl, b64Json: dataUrlToBase64(reference.dataUrl), mimeType: reference.mimeType });
      }
      const doodle = doodleRef.current?.exportPng();
      if (doodle) {
        setGenerationMessage("Reading doodle…");
        const uploaded = await uploadReference.mutateAsync({ dataUrl: doodle, filename: "idea-doodle.png", mimeType: "image/png" });
        uploadedRefs.push({ url: uploaded.url, b64Json: dataUrlToBase64(doodle), mimeType: "image/png" });
      }
      setGenerationMessage("Generating concept with Forge Image Service…");
      const result = await generateConcept.mutateAsync({ projectId, projectName, prompt, style, originalImages: uploadedRefs });
      setConceptUrl(result.url); setStage("concept"); setGenerationMessage("Concept ready");
      toast.success("Concept generated", { description: "The image came from the configured Forge Image Service." });
    } catch (error) {
      setGenerationMessage("Generation failed");
      toast.error(error instanceof Error ? error.message : "Generation failed");
    }
  };

  const ensureProject = async () => {
    if (projectId) return projectId;
    const result = await createProject.mutateAsync({ name: projectName });
    if (result.id) setProjectId(result.id);
    if (!result.persisted) toast("Session is local", { description: "Database unavailable; the current workspace remains usable but is not persisted." });
    return result.id ?? undefined;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try { await ensureProject(); toast.success("Project saved"); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save project"); } finally { setIsSaving(false); }
  };

  const handleGenerate3D = async () => {
    try {
      await generate3D.mutateAsync({ prompt, conceptUrl, ...modelConfig });
      setStage("model"); setGenerationMessage("3D job queued");
      toast.success("3D job queued", { description: "The configured provider accepted the request." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "3D generation unavailable", { description: "No fake model was created. Configure a server-side provider to continue." });
    }
  };

  const handleExport = async () => {
    try { await viewportRef.current?.exportGLB(); toast.success("GLB export downloaded"); } catch (error) { toast.error(error instanceof Error ? error.message : "Export failed"); }
  };

  const handleImport = (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb") && !file.name.toLowerCase().endsWith(".gltf")) { toast.error("Import only supports .glb and .gltf in this build"); return; }
    setImportedUrl(URL.createObjectURL(file)); setStage("model"); toast.success("3D asset loaded in the viewport");
  };

  return (
    <div className="min-h-screen bg-[#080b10] text-[#f2f5f7] selection:bg-[#d7ff48] selection:text-[#10140c]">
      <header className="flex h-[68px] items-center justify-between border-b border-white/8 bg-[#0b1017]/95 px-4 md:px-6">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowMobileNav(true)}><Menu className="h-5 w-5" /></Button><div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#d7ff48] text-[#10140c]"><Sparkles className="h-4 w-4" /></div><div><div className="text-sm font-black tracking-[0.19em]">FORGE<span className="text-[#d7ff48]">³</span>D</div><div className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">AI CREATION STUDIO</div></div></div></div>
        <div className="hidden items-center gap-2 md:flex"><button onClick={newIdea} className="forge-ghost"><Plus className="h-3.5 w-3.5" /> New idea</button><span className="h-5 w-px bg-white/10" /><button onClick={() => toast("No previous versions in this thread")} className="icon-button" aria-label="Undo"><Undo2 className="h-4 w-4" /></button><button onClick={() => toast("No forward versions in this thread")} className="icon-button" aria-label="Redo"><Redo2 className="h-4 w-4" /></button><button onClick={handleSave} className="forge-ghost"><Save className="h-3.5 w-3.5" /> {isSaving ? "Saving…" : "Save"}</button></div>
        <div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${providers.data?.image.configured ? "bg-[#d7ff48] shadow-[0_0_10px_#d7ff48]" : "bg-amber-300"}`} /><span className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/50">AI {providers.data?.image.configured ? "online" : "setup"}</span></div><button onClick={handleExport} className="forge-primary hidden sm:flex"><ArrowDownToLine className="h-3.5 w-3.5" /> Export</button>{user ? <div className="grid h-8 w-8 place-items-center rounded-full bg-[#31404d] text-xs font-bold">{user.name?.slice(0, 1) ?? "U"}</div> : <button onClick={() => startLogin()} className="icon-button" aria-label="Sign in"><CircleHelp className="h-4 w-4" /></button>}</div>
      </header>

      <div className="flex min-h-[calc(100vh-68px)]">
        <aside className={`${showMobileNav ? "fixed inset-y-0 left-0 z-50 flex" : "hidden"} w-[230px] shrink-0 flex-col border-r border-white/8 bg-[#0b1017] p-4 md:flex`}>
          <div className="mb-8 flex items-center justify-between md:hidden"><span className="text-xs font-bold uppercase tracking-widest text-white/40">Workspace</span><Button variant="ghost" size="icon" onClick={() => setShowMobileNav(false)}><X className="h-4 w-4" /></Button></div>
          <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">Workspace</div>
          <div className="space-y-1">{toolItems.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => { setActiveTool(item.id); setShowMobileNav(false); if (item.id !== "forge") notifyComingSoon(item.label); }} className={`nav-item ${activeTool === item.id ? "nav-item-active" : ""}`}><Icon className="h-4 w-4" />{item.label}{item.id !== "forge" && <span className="ml-auto text-[9px] text-white/20">SOON</span>}</button>; })}</div>
          <div className="mt-8 mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">Project</div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3"><div className="mb-3 flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#d7ff48]/10 text-[#d7ff48]"><Box className="h-4 w-4" /></div><div className="min-w-0"><div className="truncate text-xs font-bold">{projectName}</div><div className="text-[10px] text-white/35">{stageLabel}</div></div></div><div className="h-1 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-[#d7ff48] transition-all" style={{ width: stage === "idea" ? "28%" : stage === "concept" ? "62%" : "100%" }} /></div><div className="mt-2 flex justify-between text-[9px] uppercase tracking-widest text-white/30"><span>Thread 01</span><span>{refsCount} refs</span></div></div>
          <div className="mt-auto space-y-1"><button onClick={() => notifyComingSoon("Settings")} className="nav-item"><Settings2 className="h-4 w-4" /> Settings</button><button onClick={() => notifyComingSoon("Help center")} className="nav-item"><CircleHelp className="h-4 w-4" /> Help center</button></div>
        </aside>

        <main className="grid min-w-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(380px,0.85fr)_minmax(460px,1.55fr)_300px]">
          <section className="border-b border-white/8 bg-[#0b1017] p-4 md:p-6 xl:border-b-0 xl:border-r"><div className="mb-5 flex items-center justify-between"><div><div className="eyebrow">01 / IDEA FORGE</div><h1 className="mt-1 text-xl font-bold tracking-tight">Shape the impossible.</h1></div><button onClick={() => notifyComingSoon("Command palette")} className="icon-button"><Command className="h-4 w-4" /></button></div><div className="mb-5 flex rounded-xl border border-white/8 bg-white/[0.025] p-1"><button onClick={() => setActiveTab("prompt")} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${activeTab === "prompt" ? "bg-white/10 text-white" : "text-white/35"}`}>Prompt</button><button onClick={() => setActiveTab("references")} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${activeTab === "references" ? "bg-white/10 text-white" : "text-white/35"}`}>References <span className="ml-1 text-[#d7ff48]">{refsCount}</span></button></div>{activeTab === "prompt" ? <div className="space-y-4"><div className="relative"><Textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Describe what you want to create…" className="min-h-[150px] resize-none border-white/10 bg-[#111824] pr-4 text-sm leading-6 text-white placeholder:text-white/25 focus-visible:ring-[#d7ff48]/50" /><div className="absolute bottom-3 right-3 flex items-center gap-2 text-[9px] uppercase tracking-widest text-white/25"><BrainCircuit className="h-3 w-3" /> Multilingual</div></div><div><div className="mb-2 flex items-center justify-between"><span className="section-label">Style direction</span><button onClick={() => notifyComingSoon("Custom style")} className="text-[10px] font-bold uppercase tracking-wider text-[#d7ff48]">+ Custom</button></div><div className="flex flex-wrap gap-2">{styles.map(item => <button key={item} onClick={() => setStyle(item)} className={`chip ${style === item ? "chip-active" : ""}`}>{item}</button>)}</div></div><div><div className="mb-2 flex items-center justify-between"><span className="section-label">Doodle input</span><span className="text-[10px] text-white/25">optional</span></div><DoodleCanvas ref={doodleRef} /></div><div className="grid grid-cols-2 gap-2"><button onClick={() => fileInputRef.current?.click()} className="drop-button"><ImagePlus className="h-4 w-4 text-[#d7ff48]" /><span><b>Add reference</b><small>PNG, JPG, WEBP</small></span><input ref={fileInputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => Array.from(event.target.files ?? []).forEach(addReference)} /></button><button onClick={() => modelInputRef.current?.click()} className="drop-button"><Upload className="h-4 w-4 text-[#d7ff48]" /><span><b>Import 3D</b><small>GLB, GLTF</small></span><input ref={modelInputRef} className="hidden" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={event => handleImport(event.target.files?.[0])} /></button></div>{references.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1">{references.map(reference => <div key={reference.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10"><img src={reference.dataUrl} alt={reference.name} className="h-full w-full object-cover" /><button onClick={() => setReferences(current => current.filter(item => item.id !== reference.id))} className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white/70"><X className="h-3 w-3" /></button></div>)}</div>}<button onClick={handleGenerate} disabled={generateConcept.isPending || uploadReference.isPending} className="forge-generate">{generateConcept.isPending || uploadReference.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generateConcept.isPending || uploadReference.isPending ? "Forging concept…" : "Generate concept"}<span className="ml-auto text-[10px] uppercase tracking-widest opacity-60">⌘ ↵</span></button></div> : <div className="space-y-4"><div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5 text-center"><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[#d7ff48]/10 text-[#d7ff48]"><ImagePlus className="h-5 w-5" /></div><h3 className="text-sm font-bold">Layer references by intent</h3><p className="mt-1 text-xs leading-5 text-white/40">Shape, style and material references are sent together with your prompt.</p><button onClick={() => fileInputRef.current?.click()} className="mt-4 forge-secondary"><Plus className="h-3.5 w-3.5" /> Add images</button></div>{["Shape Reference", "Style Reference", "Material Reference"].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3"><div className={`grid h-8 w-8 place-items-center rounded-lg ${index === 0 ? "bg-blue-400/10 text-blue-300" : index === 1 ? "bg-fuchsia-400/10 text-fuchsia-300" : "bg-orange-300/10 text-orange-200"}`}><Rotate3D className="h-4 w-4" /></div><div className="flex-1"><div className="text-xs font-semibold">{item}</div><div className="text-[10px] text-white/30">{references[index]?.name ?? "Awaiting input"}</div></div>{references[index] ? <Check className="h-4 w-4 text-[#d7ff48]" /> : <span className="text-[9px] uppercase tracking-widest text-white/20">empty</span>}</div>)}</div>}</section>

          <section className="relative min-h-[600px] bg-[#080b10] p-4 md:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">02 / VIEWPORT</div><div className="mt-1 flex items-center gap-2"><h2 className="text-lg font-bold">{projectName}</h2><Badge className="border-[#d7ff48]/20 bg-[#d7ff48]/10 text-[#d7ff48] hover:bg-[#d7ff48]/10">{generationMessage}</Badge></div></div><div className="flex items-center gap-1"><button onClick={() => setWireframe(value => !value)} className={`viewport-tool ${wireframe ? "viewport-tool-active" : ""}`}><Grid3X3 className="h-3.5 w-3.5" /> Wireframe</button><button onClick={() => setImportedUrl(undefined)} className="icon-button" aria-label="Reset viewport"><Rotate3D className="h-4 w-4" /></button><button onClick={handleExport} className="icon-button" aria-label="Export GLB"><Download className="h-4 w-4" /></button></div></div><div className="relative h-[calc(100%-62px)] min-h-[500px]"><ForgeViewport ref={viewportRef} wireframe={wireframe} lightPower={lightPower} materialColor={materialColor} environment={environment} importedUrl={importedUrl} />{conceptUrl && <div className="absolute bottom-5 left-5 flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b1017]/90 p-2 backdrop-blur"><img src={conceptUrl} alt="Generated concept" className="h-12 w-12 rounded-lg object-cover" /><div className="pr-2"><div className="text-[9px] font-bold uppercase tracking-widest text-[#d7ff48]">Concept reference</div><div className="mt-0.5 max-w-[180px] truncate text-xs text-white/60">Ready to translate into 3D</div></div></div>}</div></section>

          <aside className="border-t border-white/8 bg-[#0b1017] p-4 md:p-6 xl:border-l xl:border-t-0"><div className="mb-5 flex items-center justify-between"><div><div className="eyebrow">03 / INSPECTOR</div><h2 className="mt-1 text-lg font-bold">Scene controls</h2></div><button onClick={() => notifyComingSoon("Inspector presets")} className="icon-button"><MoreHorizontal className="h-4 w-4" /></button></div><div className="space-y-5"><div><div className="mb-2 flex items-center justify-between"><span className="section-label">Environment</span><span className="text-[10px] text-[#d7ff48]">LIVE</span></div><div className="grid grid-cols-3 gap-1.5">{(["studio", "sunset", "night"] as const).map(item => <button key={item} onClick={() => setEnvironment(item)} className={`preset ${environment === item ? "preset-active" : ""}`}><span className={`mb-2 block h-8 rounded-md ${item === "studio" ? "bg-gradient-to-br from-[#526276] to-[#dce2ec]" : item === "sunset" ? "bg-gradient-to-br from-[#f79853] to-[#342134]" : "bg-gradient-to-br from-[#172440] to-[#05070d]"}`} /><span className="text-[9px] capitalize">{item}</span></button>)}</div></div><div><div className="mb-2 flex items-center justify-between"><span className="section-label">Key light</span><span className="text-xs font-semibold text-white/60">{lightPower.toFixed(1)}</span></div><input type="range" min="0.4" max="4" step="0.1" value={lightPower} onChange={event => setLightPower(Number(event.target.value))} className="w-full accent-[#d7ff48]" /><div className="mt-1 flex justify-between text-[9px] uppercase tracking-wider text-white/25"><span>Soft</span><span>Bright</span></div></div><div><div className="mb-2 flex items-center justify-between"><span className="section-label">Material</span><span className="text-[10px] text-white/30">PBR</span></div><div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] p-2"><input type="color" value={materialColor} onChange={event => setMaterialColor(event.target.value)} className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent" /><div><div className="text-xs font-semibold">Base color</div><div className="text-[10px] font-mono text-white/30">{materialColor.toUpperCase()}</div></div></div></div><div><div className="mb-2 flex items-center justify-between"><span className="section-label">3D generation</span><span className="text-[10px] text-white/30">provider</span></div><div className="space-y-2"><select value={modelConfig.polygonCount} onChange={event => setModelConfig(config => ({ ...config, polygonCount: event.target.value }))} className="forge-select"><option>4K</option><option>8K</option><option>20K</option><option>50K</option><option>100K+</option></select><select value={modelConfig.textureQuality} onChange={event => setModelConfig(config => ({ ...config, textureQuality: event.target.value }))} className="forge-select"><option>Medium</option><option>High</option><option>HD</option></select><button onClick={handleGenerate3D} disabled={generate3D.isPending || !conceptUrl} className="forge-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-35">{generate3D.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Box className="h-3.5 w-3.5" />}{conceptUrl ? "Generate 3D model" : "Generate concept first"}</button></div></div><div className="rounded-2xl border border-[#d7ff48]/15 bg-[#d7ff48]/[0.04] p-3"><div className="flex items-start gap-2"><Zap className="mt-0.5 h-4 w-4 shrink-0 text-[#d7ff48]" /><div><div className="text-xs font-bold">Provider status</div><p className="mt-1 text-[10px] leading-4 text-white/45">{providers.data?.threeD.configured ? "3D provider configured. Jobs will be sent server-side." : "Image provider ready. 3D provider is not configured yet; no placeholder model will be returned."}</p></div></div></div><div><div className="mb-2 flex items-center justify-between"><span className="section-label">Quick actions</span></div><div className="grid grid-cols-2 gap-2"><button onClick={() => notifyComingSoon("Refine geometry")} className="small-action"><WandSparkles className="h-3.5 w-3.5" /> Refine</button><button onClick={() => notifyComingSoon("Variants")} className="small-action"><CopyIcon /> Variant</button><button onClick={() => notifyComingSoon("Rigging")} className="small-action"><Rotate3D className="h-3.5 w-3.5" /> Auto rig</button><button onClick={() => notifyComingSoon("Animation")} className="small-action"><Play className="h-3.5 w-3.5" /> Animate</button></div></div></div></aside>
        </main>
      </div>
    </div>
  );
}

function CopyIcon() { return <Layers3 className="h-3.5 w-3.5" />; }
