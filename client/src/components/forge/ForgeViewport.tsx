import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Grid, OrbitControls, PerspectiveCamera, TransformControls, useGLTF } from "@react-three/drei";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import * as THREE from "three";
import { exportAsciiFbx } from "./fbxExporter";
import { Box, ChevronDown, Crosshair, Download, Eye, EyeOff, Move3D, Rotate3D, Scaling, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TransformMode = "translate" | "rotate" | "scale";
export type ExportFormat = "glb" | "obj" | "fbx";
export type ForgeViewportHandle = {
  export: (format: ExportFormat) => Promise<void>;
  focusObject: () => void;
  setTransform: (kind: "position" | "rotation" | "scale", axis: "x" | "y" | "z", value: number) => void;
};

type Props = {
  wireframe: boolean;
  lightPower: number;
  materialColor: string;
  environment: "studio" | "sunset" | "night";
  importedUrl?: string;
  onSelectionChange?: (name: string, object?: THREE.Object3D) => void;
  onTransformChange?: (object?: THREE.Object3D) => void;
  transformMode?: TransformMode;
};

type SceneState = {
  selected: string;
  selectedObject?: THREE.Object3D;
  mode: TransformMode;
  visible: boolean;
  showOutliner: boolean;
  setSelected: (value: string) => void;
  setSelectedObject: (value: THREE.Object3D) => void;
  setMode: (value: TransformMode) => void;
  setVisible: (value: boolean) => void;
  setShowOutliner: (value: boolean) => void;
  onTransformChange?: (object?: THREE.Object3D) => void;
  onSelectionChange?: (name: string, object?: THREE.Object3D) => void;
};

function CyberneticExplorer({ wireframe, materialColor, scene }: Pick<Props, "wireframe" | "materialColor"> & { scene: SceneState }) {
  const ring = useRef<THREE.Mesh>(null);
  const primary = useMemo(() => new THREE.MeshStandardMaterial({ color: materialColor, metalness: 0.72, roughness: 0.28, wireframe }), [materialColor, wireframe]);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#151b25", metalness: 0.88, roughness: 0.2, wireframe }), [wireframe]);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d7ff48", emissive: "#a8ce16", emissiveIntensity: 3.2, metalness: 0.2, roughness: 0.2, wireframe }), [wireframe]);
  useFrame(({ clock }) => { if (ring.current) ring.current.rotation.z = clock.getElapsedTime() * 0.45; });
  const select = (event: { stopPropagation: () => void; object?: THREE.Object3D }, name: string) => { event.stopPropagation(); scene.setSelected(name); if (event.object) scene.setSelectedObject(event.object); scene.onSelectionChange?.(name, event.object); };
  const hidden = !scene.visible;
  return (
    <group position={[0, -0.75, 0]} visible={!hidden}>
      <mesh name="Explorer Body" castShadow receiveShadow material={primary} onClick={event => select(event, "Explorer Body")}><boxGeometry args={[1.45, 1.65, 1.05]} /></mesh>
      <mesh name="Explorer Head" position={[0, 1.12, 0]} castShadow material={dark} onClick={event => select(event, "Explorer Head")}><sphereGeometry args={[0.72, 24, 16]} /></mesh>
      <mesh name="Energy Visor" position={[0, 1.12, 0.62]} material={glow} onClick={event => select(event, "Energy Visor")}><boxGeometry args={[0.34, 0.16, 0.08]} /></mesh>
      <mesh name="Antenna Left" position={[-0.28, 1.45, 0]} castShadow material={dark} onClick={event => select(event, "Antenna Left")}><cylinderGeometry args={[0.08, 0.08, 0.42, 12]} /></mesh>
      <mesh name="Antenna Right" position={[0.28, 1.45, 0]} castShadow material={dark} onClick={event => select(event, "Antenna Right")}><cylinderGeometry args={[0.08, 0.08, 0.42, 12]} /></mesh>
      <mesh name="Antenna Light" position={[0, 1.7, 0]} material={glow} onClick={event => select(event, "Antenna Light")}><sphereGeometry args={[0.09, 12, 8]} /></mesh>
      <mesh name="Energy Pack" position={[0, -0.06, -0.58]} castShadow material={dark} onClick={event => select(event, "Energy Pack")}><boxGeometry args={[0.58, 0.95, 0.18]} /></mesh>
      <mesh name="Arm Left" position={[-0.9, 0.2, 0]} rotation={[0, 0, -0.18]} castShadow material={primary} onClick={event => select(event, "Arm Left")}><capsuleGeometry args={[0.22, 0.75, 8, 16]} /></mesh>
      <mesh name="Arm Right" position={[0.9, 0.2, 0]} rotation={[0, 0, 0.18]} castShadow material={primary} onClick={event => select(event, "Arm Right")}><capsuleGeometry args={[0.22, 0.75, 8, 16]} /></mesh>
      <mesh name="Leg Left" position={[-0.43, -1.25, 0]} castShadow material={dark} onClick={event => select(event, "Leg Left")}><boxGeometry args={[0.38, 1.1, 0.5]} /></mesh>
      <mesh name="Leg Right" position={[0.43, -1.25, 0]} castShadow material={dark} onClick={event => select(event, "Leg Right")}><boxGeometry args={[0.38, 1.1, 0.5]} /></mesh>
      <mesh name="Power Ring" position={[0, 0.1, 0.56]} ref={ring} rotation={[Math.PI / 2, 0, 0]} material={glow} onClick={event => select(event, "Power Ring")}><torusGeometry args={[0.38, 0.035, 8, 48]} /></mesh>
    </group>
  );
}

function SceneContent({ wireframe, materialColor, importedUrl, scene }: Pick<Props, "wireframe" | "materialColor" | "importedUrl"> & { scene: SceneState }) {
  const selectedObject = useRef<THREE.Object3D>(null);
  return (
    <group ref={selectedObject}>
      {importedUrl ? <ImportedModel url={importedUrl} onSelect={() => scene.setSelected("Imported Model")} /> : <CyberneticExplorer wireframe={wireframe} materialColor={materialColor} scene={scene} />}
      {scene.selected !== "Scene" && <TransformControls mode={scene.mode} object={scene.selectedObject} size={0.8} onObjectChange={() => scene.onTransformChange?.(scene.selectedObject)} />}
    </group>
  );
}

function ImportedModel({ url, onSelect }: { url: string; onSelect: () => void }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} scale={1.6} position={[0, -1.1, 0]} onClick={onSelect} />;
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export const ForgeViewport = forwardRef<ForgeViewportHandle, Props>(function ForgeViewport({ wireframe, lightPower, materialColor, environment, importedUrl, onSelectionChange, onTransformChange, transformMode }, ref) {
  const [selected, setSelected] = useState("Scene");
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D>();
  const [mode, setMode] = useState<TransformMode>("translate");
  const [visible, setVisible] = useState(true);
  const [showOutliner, setShowOutliner] = useState(true);
  const controlsRef = useRef<any>(null);
  const exportRoot = useRef<THREE.Group | null>(null);
  const sceneEnvironment = environment === "night" ? "night" : environment === "sunset" ? "sunset" : "studio";
  const activeMode = transformMode ?? mode;
  const sceneState: SceneState = { selected, selectedObject, mode: activeMode, visible, showOutliner, setSelected, setSelectedObject, setMode, setVisible, setShowOutliner, onTransformChange, onSelectionChange };

  useImperativeHandle(ref, () => ({
    export: async (format: ExportFormat) => {
      const source = exportRoot.current;
      if (!source) throw new Error("No model in viewport");
      if (format === "glb") {
        const exporter = new GLTFExporter();
        const result = await new Promise<ArrayBuffer>((resolve, reject) => exporter.parse(source, value => resolve(value instanceof ArrayBuffer ? value : new TextEncoder().encode(JSON.stringify(value)).buffer), reject, { binary: true }));
        downloadBlob(new Blob([result], { type: "model/gltf-binary" }), "forge-cybernetic-explorer.glb");
      } else if (format === "obj") {
        const result = new OBJExporter().parse(source);
        downloadBlob(new Blob([result], { type: "text/plain" }), "forge-cybernetic-explorer.obj");
      } else {
        const result = exportAsciiFbx(source);
        downloadBlob(new Blob([result], { type: "application/octet-stream" }), "forge-cybernetic-explorer.fbx");
      }
    },
    focusObject: () => controlsRef.current?.target?.set(0, 0, 0),
    setTransform: (kind, axis, value) => { if (selectedObject) { selectedObject[kind][axis] = value; onTransformChange?.(selectedObject); } },
  }), [selectedObject, onTransformChange]);

  return (
    <div className="relative h-full min-h-[500px] w-full overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#0b1017]">
      <Canvas shadows dpr={[1, 1.6]} camera={{ position: [4.2, 2.6, 5.2], fov: 36 }} gl={{ antialias: true }}>
        <color attach="background" args={["#0b1017"]} />
        <PerspectiveCamera makeDefault position={[4.2, 2.6, 5.2]} fov={36} />
        <ambientLight intensity={0.45} />
        <directionalLight castShadow position={[3, 5, 4]} intensity={lightPower} color="#f2f5ff" shadow-mapSize={[2048, 2048]} />
        <pointLight position={[-3, 1, 2]} intensity={lightPower * 0.7} color="#b8d8ff" />
        <group ref={exportRoot}><SceneContent wireframe={wireframe} materialColor={materialColor} importedUrl={importedUrl} scene={sceneState} /></group>
        <Grid args={[12, 12]} cellSize={0.4} cellThickness={0.5} cellColor="#273142" sectionSize={2} sectionThickness={0.9} sectionColor="#3c4b5f" fadeDistance={14} infiniteGrid />
        <Environment preset={sceneEnvironment as "studio" | "sunset" | "night"} background={false} />
        <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} minDistance={2.8} maxDistance={10} target={[0, 0, 0]} />
      </Canvas>
      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-xl border border-white/10 bg-[#0b1017]/90 p-1.5 backdrop-blur">
        <Button size="icon" variant="ghost" className={mode === "translate" ? "bg-[#d7ff48]/15 text-[#d7ff48]" : "text-white/50"} onClick={() => setMode("translate")} title="Translate"><Move3D className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className={mode === "rotate" ? "bg-[#d7ff48]/15 text-[#d7ff48]" : "text-white/50"} onClick={() => setMode("rotate")} title="Rotate"><Rotate3D className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className={mode === "scale" ? "bg-[#d7ff48]/15 text-[#d7ff48]" : "text-white/50"} onClick={() => setMode("scale")} title="Scale"><Scaling className="h-3.5 w-3.5" /></Button>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <Button size="icon" variant="ghost" className="text-white/50" onClick={() => setShowOutliner(value => !value)} title="Scene outliner"><SlidersHorizontal className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="text-white/50" onClick={() => setVisible(value => !value)} title="Toggle visibility">{visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</Button>
      </div>
      {showOutliner && <div className="absolute right-3 top-3 w-44 rounded-xl border border-white/10 bg-[#0b1017]/90 p-2 backdrop-blur"><div className="mb-2 flex items-center justify-between px-1 text-[9px] font-bold uppercase tracking-[.18em] text-white/35"><span>Scene</span><Box className="h-3 w-3" /></div>{["Scene", "Explorer Body", "Explorer Head", "Energy Pack", "Antenna Light"].map(item => <button key={item} onClick={() => setSelected(item)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] ${selected === item ? "bg-[#d7ff48]/10 text-[#d7ff48]" : "text-white/45 hover:bg-white/5 hover:text-white/80"}`}><span className={`h-1.5 w-1.5 rounded-full ${selected === item ? "bg-[#d7ff48]" : "bg-white/20"}`} />{item}</button>)}</div>}
      {selected !== "Scene" && <div className="absolute bottom-4 left-4 rounded-lg border border-[#d7ff48]/20 bg-[#0b1017]/90 px-3 py-2 text-[10px] text-white/65 backdrop-blur"><span className="font-bold text-[#d7ff48]">{selected}</span><span className="mx-2 text-white/20">•</span>{mode} gizmo active</div>}
      <div className="pointer-events-none absolute bottom-3 right-4 text-[10px] font-semibold uppercase tracking-[.22em] text-white/35">Orbit / pan / zoom</div>
    </div>
  );
});
