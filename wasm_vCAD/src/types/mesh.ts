// Mesh data from WASM
export interface MeshData {
  vertices: Float32Array | number[]  // [x, y, z, x, y, z, ...]
  indices: Uint32Array | number[]    // Triangle indices
  normals: Float32Array | number[]   // [nx, ny, nz, nx, ny, nz, ...]
}
