import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { exportAsciiFbx } from "./fbxExporter";

describe("exportAsciiFbx", () => {
  it("serializes real mesh vertices and polygon indices", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.name = "Explorer Body";
    root.add(mesh);
    const output = exportAsciiFbx(root);
    expect(output).toContain("FBXVersion: 7400");
    expect(output).toContain("Geometry::Explorer_Body");
    expect(output).toContain("Vertices:");
    expect(output).toContain("PolygonVertexIndex:");
  });
});
