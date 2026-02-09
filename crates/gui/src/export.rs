use std::collections::HashMap;

use crate::viewport::mesh::MeshData;

/// GLB magic number: "glTF"
const GLB_MAGIC: u32 = 0x46546C67;
/// GLB version 2
const GLB_VERSION: u32 = 2;
/// JSON chunk type
const CHUNK_TYPE_JSON: u32 = 0x4E4F534A;
/// BIN chunk type
const CHUNK_TYPE_BIN: u32 = 0x004E4942;

/// glTF component types
const FLOAT: u32 = 5126;
const UNSIGNED_INT: u32 = 5125;

/// glTF buffer view targets
const ARRAY_BUFFER: u32 = 34962;
const ELEMENT_ARRAY_BUFFER: u32 = 34963;

/// Build a complete GLB (binary glTF) file from mesh data.
///
/// Each entry in `meshes` becomes a separate node/mesh in the glTF scene.
pub fn build_glb(meshes: &HashMap<String, MeshData>) -> Vec<u8> {
    if meshes.is_empty() {
        return Vec::new();
    }

    // Sort mesh keys for deterministic output
    let mut keys: Vec<&String> = meshes.keys().collect();
    keys.sort();

    // ── Phase 1: Build binary buffer ─────────────────────────
    let mut bin_data: Vec<u8> = Vec::new();

    struct MeshMeta {
        name: String,
        vertex_count: usize,
        index_count: usize,
        pos_offset: usize,
        pos_length: usize,
        norm_offset: usize,
        norm_length: usize,
        idx_offset: usize,
        idx_length: usize,
        pos_min: [f32; 3],
        pos_max: [f32; 3],
    }

    let mut metas: Vec<MeshMeta> = Vec::new();

    for key in &keys {
        let mesh = &meshes[*key];
        let vertex_count = mesh.vertex_count();
        let index_count = mesh.indices.len();

        if vertex_count == 0 || index_count == 0 {
            continue;
        }

        // Extract positions and normals from interleaved data
        // Format: [px, py, pz, nx, ny, nz, r, g, b] × vertex_count
        let mut positions: Vec<f32> = Vec::with_capacity(vertex_count * 3);
        let mut normals: Vec<f32> = Vec::with_capacity(vertex_count * 3);
        let mut pos_min = [f32::MAX; 3];
        let mut pos_max = [f32::MIN; 3];

        for v in 0..vertex_count {
            let base = v * 9;
            let px = mesh.vertices[base];
            let py = mesh.vertices[base + 1];
            let pz = mesh.vertices[base + 2];
            let nx = mesh.vertices[base + 3];
            let ny = mesh.vertices[base + 4];
            let nz = mesh.vertices[base + 5];

            positions.extend_from_slice(&[px, py, pz]);
            normals.extend_from_slice(&[nx, ny, nz]);

            pos_min[0] = pos_min[0].min(px);
            pos_min[1] = pos_min[1].min(py);
            pos_min[2] = pos_min[2].min(pz);
            pos_max[0] = pos_max[0].max(px);
            pos_max[1] = pos_max[1].max(py);
            pos_max[2] = pos_max[2].max(pz);
        }

        // Positions
        let pos_offset = bin_data.len();
        let pos_bytes = floats_to_bytes(&positions);
        let pos_length = pos_bytes.len();
        bin_data.extend_from_slice(&pos_bytes);

        // Normals
        let norm_offset = bin_data.len();
        let norm_bytes = floats_to_bytes(&normals);
        let norm_length = norm_bytes.len();
        bin_data.extend_from_slice(&norm_bytes);

        // Indices
        let idx_offset = bin_data.len();
        let idx_bytes = u32s_to_bytes(&mesh.indices);
        let idx_length = idx_bytes.len();
        bin_data.extend_from_slice(&idx_bytes);

        // Pad to 4-byte alignment
        while bin_data.len() % 4 != 0 {
            bin_data.push(0);
        }

        metas.push(MeshMeta {
            name: (*key).clone(),
            vertex_count,
            index_count,
            pos_offset,
            pos_length,
            norm_offset,
            norm_length,
            idx_offset,
            idx_length,
            pos_min,
            pos_max,
        });
    }

    if metas.is_empty() {
        return Vec::new();
    }

    // ── Phase 2: Build glTF JSON ─────────────────────────────
    // Build accessors, bufferViews — 3 per mesh (positions, normals, indices)
    let mut accessors = Vec::new();
    let mut buffer_views = Vec::new();
    let mut gltf_meshes = Vec::new();
    let mut nodes = Vec::new();
    let mut node_indices: Vec<usize> = Vec::new();

    for (i, meta) in metas.iter().enumerate() {
        let bv_base = i * 3; // bufferView index base
        let acc_base = i * 3; // accessor index base

        // BufferView 0: positions
        buffer_views.push(serde_json::json!({
            "buffer": 0,
            "byteOffset": meta.pos_offset,
            "byteLength": meta.pos_length,
            "target": ARRAY_BUFFER
        }));

        // BufferView 1: normals
        buffer_views.push(serde_json::json!({
            "buffer": 0,
            "byteOffset": meta.norm_offset,
            "byteLength": meta.norm_length,
            "target": ARRAY_BUFFER
        }));

        // BufferView 2: indices
        buffer_views.push(serde_json::json!({
            "buffer": 0,
            "byteOffset": meta.idx_offset,
            "byteLength": meta.idx_length,
            "target": ELEMENT_ARRAY_BUFFER
        }));

        // Accessor 0: positions
        accessors.push(serde_json::json!({
            "bufferView": bv_base,
            "byteOffset": 0,
            "componentType": FLOAT,
            "count": meta.vertex_count,
            "type": "VEC3",
            "min": [meta.pos_min[0], meta.pos_min[1], meta.pos_min[2]],
            "max": [meta.pos_max[0], meta.pos_max[1], meta.pos_max[2]]
        }));

        // Accessor 1: normals
        accessors.push(serde_json::json!({
            "bufferView": bv_base + 1,
            "byteOffset": 0,
            "componentType": FLOAT,
            "count": meta.vertex_count,
            "type": "VEC3"
        }));

        // Accessor 2: indices
        accessors.push(serde_json::json!({
            "bufferView": bv_base + 2,
            "byteOffset": 0,
            "componentType": UNSIGNED_INT,
            "count": meta.index_count,
            "type": "SCALAR"
        }));

        // Mesh
        gltf_meshes.push(serde_json::json!({
            "name": meta.name,
            "primitives": [{
                "attributes": {
                    "POSITION": acc_base,
                    "NORMAL": acc_base + 1
                },
                "indices": acc_base + 2,
                "material": 0
            }]
        }));

        // Node
        nodes.push(serde_json::json!({
            "name": meta.name,
            "mesh": i
        }));

        node_indices.push(i);
    }

    let gltf_json = serde_json::json!({
        "asset": {
            "version": "2.0",
            "generator": "vCAD v0.1"
        },
        "scene": 0,
        "scenes": [{
            "name": "Scene",
            "nodes": node_indices
        }],
        "nodes": nodes,
        "meshes": gltf_meshes,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{
            "byteLength": bin_data.len()
        }],
        "materials": [{
            "name": "Default",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.7, 0.7, 0.72, 1.0],
                "metallicFactor": 0.3,
                "roughnessFactor": 0.5
            }
        }]
    });

    let json_str = serde_json::to_string(&gltf_json).unwrap_or_default();
    let mut json_bytes = json_str.into_bytes();

    // Pad JSON to 4-byte alignment with spaces (per GLB spec)
    while json_bytes.len() % 4 != 0 {
        json_bytes.push(b' ');
    }

    // Pad BIN to 4-byte alignment with zeros (per GLB spec)
    while bin_data.len() % 4 != 0 {
        bin_data.push(0);
    }

    // ── Phase 3: Assemble GLB ────────────────────────────────
    let json_chunk_length = json_bytes.len() as u32;
    let bin_chunk_length = bin_data.len() as u32;

    let total_length: u32 = 12 // header
        + 8 + json_chunk_length  // JSON chunk header + data
        + 8 + bin_chunk_length;  // BIN chunk header + data

    let mut glb = Vec::with_capacity(total_length as usize);

    // Header
    glb.extend_from_slice(&GLB_MAGIC.to_le_bytes());
    glb.extend_from_slice(&GLB_VERSION.to_le_bytes());
    glb.extend_from_slice(&total_length.to_le_bytes());

    // JSON chunk
    glb.extend_from_slice(&json_chunk_length.to_le_bytes());
    glb.extend_from_slice(&CHUNK_TYPE_JSON.to_le_bytes());
    glb.extend_from_slice(&json_bytes);

    // BIN chunk
    glb.extend_from_slice(&bin_chunk_length.to_le_bytes());
    glb.extend_from_slice(&CHUNK_TYPE_BIN.to_le_bytes());
    glb.extend_from_slice(&bin_data);

    glb
}

fn floats_to_bytes(data: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(data.len() * 4);
    for &f in data {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    bytes
}

fn u32s_to_bytes(data: &[u32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(data.len() * 4);
    for &v in data {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes
}
