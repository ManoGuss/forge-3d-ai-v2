# Export

## Available now

- **GLB** — exported in-browser from the current real Three.js scene using `GLTFExporter`.
- **GLB/GLTF import** — local `.glb` and `.gltf` files can be loaded into the viewport for inspection.

The exported sample scene is a real mesh hierarchy, not a flat image. Camera orbit, lights, materials and wireframe are rendered by WebGL.

## Planned adapters

- OBJ and STL through dedicated client/server exporters.
- FBX and USD/USDZ through server-side conversion workers or a provider that supports those formats.
- Complete project ZIP with model, textures, materials, animation and audio once those assets are persisted.
- Engine profiles for Unity, Unreal, Godot, Roblox and UEFN.

## Important rule

An export action must only download a file created by a real exporter or returned by a configured provider. If an exporter is not available, the UI must show a clear unavailable state instead of downloading an empty or misleading file.
