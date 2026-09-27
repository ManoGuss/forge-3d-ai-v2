import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import * as THREE from "three";

export type ForgeViewportHandle = { exportGLB: () => Promise<void>; focusObject: () => void };

type Props = {
  wireframe: boolean;
  lightPower: number;
  materialColor: string;
  environment: "studio" | "sunset" | "night";
  importedUrl?: string;
};

function CyberneticExplorer({ wireframe, materialColor }: Pick<Props, "wireframe" | "materialColor">) {
  const ring = useRef<THREE.Mesh>(null);
  const primary = useMemo(() => new THREE.MeshStandardMaterial({ color: materialColor, metalness: 0.72, roughness: 0.28, wireframe }), [materialColor, wireframe]);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#151b25", metalness: 0.88, roughness: 0.2, wireframe }), [wireframe]);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d7ff48", emissive: "#a8ce16", emissiveIntensity: 3.2, metalness: 0.2, roughness: 0.2, wireframe }), [wireframe]);
  useFrame(({ clock }) => { if (ring.current) ring.current.rotation.z = clock.getElapsedTime() * 0.45; });
  return (
    <group position={[0, -0.75, 0]}>
      <mesh castShadow receiveShadow material={primary}><boxGeometry args={[1.45, 1.65, 1.05]} /></mesh>
      <mesh position={[0, 1.12, 0]} castShadow material={dark}><sphereGeometry args={[0.72, 24, 16]} /></mesh>
      <mesh position={[0, 1.12, 0.62]} material={glow}><boxGeometry args={[0.34, 0.16, 0.08]} /></mesh>
      <mesh position={[-0.28, 1.45, 0]} castShadow material={dark}><cylinderGeometry args={[0.08, 0.08, 0.42, 12]} /></mesh>
      <mesh position={[0.28, 1.45, 0]} castShadow material={dark}><cylinderGeometry args={[0.08, 0.08, 0.42, 12]} /></mesh>
      <mesh position={[0, 1.7, 0]} material={glow}><sphereGeometry args={[0.09, 12, 8]} /></mesh>
      <mesh position={[0, -0.06, -0.58]} castShadow material={dark}><boxGeometry args={[0.58, 0.95, 0.18]} /></mesh>
      <mesh position={[-0.9, 0.2, 0]} rotation={[0, 0, -0.18]} castShadow material={primary}><capsuleGeometry args={[0.22, 0.75, 8, 16]} /></mesh>
      <mesh position={[0.9, 0.2, 0]} rotation={[0, 0, 0.18]} castShadow material={primary}><capsuleGeometry args={[0.22, 0.75, 8, 16]} /></mesh>
      <mesh position={[-0.43, -1.25, 0]} castShadow material={dark}><boxGeometry args={[0.38, 1.1, 0.5]} /></mesh>
      <mesh position={[0.43, -1.25, 0]} castShadow material={dark}><boxGeometry args={[0.38, 1.1, 0.5]} /></mesh>
      <mesh position={[0, 0.1, 0.56]} ref={ring} rotation={[Math.PI / 2, 0, 0]} material={glow}><torusGeometry args={[0.38, 0.035, 8, 48]} /></mesh>
    </group>
  );
}

function ImportedModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} scale={1.6} position={[0, -1.1, 0]} />;
}

function ExportBridge({ groupRef, onReady }: { groupRef: React.MutableRefObject<THREE.Group | null>; onReady: (exporter: () => Promise<void>) => void }) {
  onReady(async () => {
    const source = groupRef.current;
    if (!source) throw new Error("No model in viewport");
    const exporter = new GLTFExporter();
    const result = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(source, (value: ArrayBuffer | object) => {
        if (value instanceof ArrayBuffer) resolve(value);
        else resolve(new TextEncoder().encode(JSON.stringify(value)).buffer);
      }, reject, { binary: true });
    });
    const blob = new Blob([result], { type: "model/gltf-binary" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "forge-cybernetic-explorer.glb";
    anchor.click();
    URL.revokeObjectURL(href);
  });
  return null;
}

export const ForgeViewport = forwardRef<ForgeViewportHandle, Props>(function ForgeViewport({ wireframe, lightPower, materialColor, environment, importedUrl }, ref) {
  const groupRef = useRef<THREE.Group | null>(null);
  const exportFn = useRef<(() => Promise<void>) | undefined>(undefined);
  const controlsRef = useRef<any>(null);
  useImperativeHandle(ref, () => ({
    exportGLB: async () => { if (exportFn.current) await exportFn.current(); },
    focusObject: () => controlsRef.current?.target?.set(0, 0, 0),
  }), []);
  const sceneEnvironment = environment === "night" ? "night" : environment === "sunset" ? "sunset" : "studio";

  return (
    <div className="h-full min-h-[440px] w-full overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#0b1017]">
      <Canvas shadows dpr={[1, 1.6]} camera={{ position: [4.2, 2.6, 5.2], fov: 36 }} gl={{ antialias: true }}>
        <color attach="background" args={["#0b1017"]} />
        <PerspectiveCamera makeDefault position={[4.2, 2.6, 5.2]} fov={36} />
        <ambientLight intensity={0.45} />
        <directionalLight castShadow position={[3, 5, 4]} intensity={lightPower} color="#f2f5ff" shadow-mapSize={[2048, 2048]} />
        <pointLight position={[-3, 1, 2]} intensity={lightPower * 0.7} color="#b8d8ff" />
        <group ref={groupRef}>
          {importedUrl ? <ImportedModel url={importedUrl} /> : <CyberneticExplorer wireframe={wireframe} materialColor={materialColor} />}
        </group>
        <Grid args={[12, 12]} cellSize={0.4} cellThickness={0.5} cellColor="#273142" sectionSize={2} sectionThickness={0.9} sectionColor="#3c4b5f" fadeDistance={14} infiniteGrid />
        <ContactShadows position={[0, -1.82, 0]} opacity={0.45} scale={6} blur={2.5} far={4} />
        <Environment preset={sceneEnvironment as "studio" | "sunset" | "night"} background={false} />
        <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} minDistance={2.8} maxDistance={10} target={[0, 0, 0]} />
        <ExportBridge groupRef={groupRef} onReady={fn => { exportFn.current = fn; }} />
      </Canvas>
      <div className="pointer-events-none relative -mt-12 flex justify-between px-5 pb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
        <span>Orbit / pan / zoom</span>
        <span>WebGL viewport</span>
      </div>
    </div>
  );
});
