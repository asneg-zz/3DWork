use std::collections::HashMap;

use glow::HasContext;

use super::camera::ArcBallCamera;
use super::mesh::{self, LineMeshData, MeshData};
use crate::state::settings::{AxisSettings, GridSettings};

// ── Render parameters ────────────────────────────────────────

/// Parameters for rendering the viewport
pub struct RenderParams {
    /// Viewport rectangle [x, y, width, height] in pixels
    pub viewport: [f32; 4],
    /// Show grid
    pub grid_visible: bool,
    /// Show axes
    pub axes_visible: bool,
    /// Axis line thickness
    pub axes_thickness: f32,
    /// Background color RGB
    pub bg_color: [u8; 3],
}

// ── GPU mesh handles ─────────────────────────────────────────

struct GpuMesh {
    vao: glow::VertexArray,
    _vbo: glow::Buffer,
    ibo: glow::Buffer,
    index_count: i32,
}

struct GpuLines {
    vao: glow::VertexArray,
    _vbo: glow::Buffer,
    vertex_count: i32,
}

// ── Main GL renderer ─────────────────────────────────────────

pub struct GlRenderer {
    mesh_program: glow::Program,
    line_program: glow::Program,
    grid: Option<GpuLines>,
    axes: Option<GpuLines>,
    /// Cached grid settings to detect changes
    cached_grid_settings: Option<(i32, f32, f32)>,
    /// Cached axes length to detect changes
    cached_axes_length: Option<f32>,
    /// Object meshes keyed by operation ID
    scene_meshes: HashMap<String, GpuMesh>,
    /// Translation gizmo lines (shown when an object is selected)
    gizmo: Option<GpuLines>,
    /// Version counter to detect scene changes
    last_scene_version: u64,
}

impl GlRenderer {
    pub fn new(gl: &glow::Context) -> Self {
        let mesh_program = compile_program(gl, MESH_VERT, MESH_FRAG);
        let line_program = compile_program(gl, LINE_VERT, LINE_FRAG);

        let grid_data = mesh::grid(5, 1.0, 0.6);
        let grid = Some(upload_lines(gl, &grid_data));

        let axes_data = mesh::axes(1.5);
        let axes = Some(upload_lines(gl, &axes_data));

        Self {
            mesh_program,
            line_program,
            grid,
            axes,
            cached_grid_settings: Some((5, 1.0, 0.6)),
            cached_axes_length: Some(1.5),
            scene_meshes: HashMap::new(),
            gizmo: None,
            last_scene_version: 0,
        }
    }

    /// Update grid mesh based on settings
    pub fn update_grid(&mut self, gl: &glow::Context, settings: &GridSettings) {
        let new_settings = (settings.range, settings.size, settings.opacity);

        if self.cached_grid_settings == Some(new_settings) {
            return;
        }

        // Delete old grid
        if let Some(old) = self.grid.take() {
            unsafe {
                gl.delete_vertex_array(old.vao);
                gl.delete_buffer(old._vbo);
            }
        }

        // Create new grid
        let grid_data = mesh::grid(settings.range, settings.size, settings.opacity);
        self.grid = Some(upload_lines(gl, &grid_data));
        self.cached_grid_settings = Some(new_settings);
    }

    /// Update axes mesh based on settings
    pub fn update_axes(&mut self, gl: &glow::Context, settings: &AxisSettings) {
        if self.cached_axes_length == Some(settings.length) {
            return;
        }

        // Delete old axes
        if let Some(old) = self.axes.take() {
            unsafe {
                gl.delete_vertex_array(old.vao);
                gl.delete_buffer(old._vbo);
            }
        }

        // Create new axes
        let axes_data = mesh::axes(settings.length);
        self.axes = Some(upload_lines(gl, &axes_data));
        self.cached_axes_length = Some(settings.length);
    }

    /// Upload pre-built mesh data to GPU, replacing previous meshes
    pub fn sync_from_meshes(
        &mut self,
        gl: &glow::Context,
        meshes: &HashMap<String, MeshData>,
        version: u64,
    ) {
        if version == self.last_scene_version && !self.scene_meshes.is_empty() {
            return;
        }
        self.last_scene_version = version;

        // Clear old GPU meshes
        for (_, mesh) in self.scene_meshes.drain() {
            unsafe {
                gl.delete_vertex_array(mesh.vao);
                gl.delete_buffer(mesh._vbo);
                gl.delete_buffer(mesh.ibo);
            }
        }

        // Upload new meshes
        for (id, mesh_data) in meshes {
            let gpu_mesh = upload_mesh(gl, mesh_data);
            self.scene_meshes.insert(id.clone(), gpu_mesh);
        }
    }

    /// Upload or remove translation gizmo lines
    pub fn sync_gizmo(&mut self, gl: &glow::Context, data: Option<&LineMeshData>) {
        // Delete old gizmo
        if let Some(old) = self.gizmo.take() {
            unsafe {
                gl.delete_vertex_array(old.vao);
                gl.delete_buffer(old._vbo);
            }
        }
        // Upload new gizmo if provided
        if let Some(line_data) = data {
            self.gizmo = Some(upload_lines(gl, line_data));
        }
    }

    /// Render the scene
    pub fn paint(
        &self,
        gl: &glow::Context,
        camera: &ArcBallCamera,
        params: &RenderParams,
    ) {
        let aspect = params.viewport[2] / params.viewport[3];
        let vp = camera.view_projection(aspect);

        unsafe {
            gl.viewport(
                params.viewport[0] as i32,
                params.viewport[1] as i32,
                params.viewport[2] as i32,
                params.viewport[3] as i32,
            );
            gl.scissor(
                params.viewport[0] as i32,
                params.viewport[1] as i32,
                params.viewport[2] as i32,
                params.viewport[3] as i32,
            );
            gl.enable(glow::SCISSOR_TEST);

            // Clear viewport area with configured background color
            gl.clear_color(
                params.bg_color[0] as f32 / 255.0,
                params.bg_color[1] as f32 / 255.0,
                params.bg_color[2] as f32 / 255.0,
                1.0,
            );
            gl.clear(glow::COLOR_BUFFER_BIT | glow::DEPTH_BUFFER_BIT);

            gl.enable(glow::DEPTH_TEST);
            gl.depth_func(glow::LESS);

            // Draw grid and axes (lines)
            gl.use_program(Some(self.line_program));
            set_uniform_mat4(gl, self.line_program, "u_mvp", &vp);

            if params.grid_visible {
                if let Some(ref grid) = self.grid {
                    draw_lines(gl, grid);
                }
            }

            if params.axes_visible {
                if let Some(ref axes) = self.axes {
                    gl.line_width(params.axes_thickness);
                    draw_lines(gl, axes);
                    gl.line_width(1.0);
                }
            }

            // Draw scene meshes
            gl.use_program(Some(self.mesh_program));
            set_uniform_mat4(gl, self.mesh_program, "u_mvp", &vp);

            // Light direction in world space
            let light_dir = glam::Vec3::new(0.3, 0.8, 0.5).normalize();
            set_uniform_vec3(gl, self.mesh_program, "u_light_dir", &light_dir);

            for mesh in self.scene_meshes.values() {
                draw_mesh(gl, mesh);
            }

            // Draw gizmo on top (no depth test so it's always visible)
            if let Some(ref gizmo) = self.gizmo {
                gl.disable(glow::DEPTH_TEST);
                gl.use_program(Some(self.line_program));
                set_uniform_mat4(gl, self.line_program, "u_mvp", &vp);
                gl.line_width(3.0);
                draw_lines(gl, gizmo);
                gl.line_width(1.0);
                gl.enable(glow::DEPTH_TEST);
            }

            gl.disable(glow::DEPTH_TEST);
            gl.disable(glow::SCISSOR_TEST);
            gl.use_program(None);
        }
    }

    #[allow(dead_code)]
    pub fn destroy(&self, gl: &glow::Context) {
        unsafe {
            gl.delete_program(self.mesh_program);
            gl.delete_program(self.line_program);
            if let Some(ref grid) = self.grid {
                gl.delete_vertex_array(grid.vao);
                gl.delete_buffer(grid._vbo);
            }
            if let Some(ref axes) = self.axes {
                gl.delete_vertex_array(axes.vao);
                gl.delete_buffer(axes._vbo);
            }
            if let Some(ref gizmo) = self.gizmo {
                gl.delete_vertex_array(gizmo.vao);
                gl.delete_buffer(gizmo._vbo);
            }
            for mesh in self.scene_meshes.values() {
                gl.delete_vertex_array(mesh.vao);
                gl.delete_buffer(mesh._vbo);
                gl.delete_buffer(mesh.ibo);
            }
        }
    }
}

// ── GPU upload ───────────────────────────────────────────────

fn upload_mesh(gl: &glow::Context, data: &MeshData) -> GpuMesh {
    unsafe {
        let vao = gl.create_vertex_array().unwrap();
        gl.bind_vertex_array(Some(vao));

        let vbo = gl.create_buffer().unwrap();
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(vbo));
        gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            bytemuck_cast_slice(&data.vertices),
            glow::STATIC_DRAW,
        );

        let stride = 9 * 4; // 9 floats * 4 bytes
        // position: location 0
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_f32(0, 3, glow::FLOAT, false, stride, 0);
        // normal: location 1
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_f32(1, 3, glow::FLOAT, false, stride, 3 * 4);
        // color: location 2
        gl.enable_vertex_attrib_array(2);
        gl.vertex_attrib_pointer_f32(2, 3, glow::FLOAT, false, stride, 6 * 4);

        let ibo = gl.create_buffer().unwrap();
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(ibo));
        gl.buffer_data_u8_slice(
            glow::ELEMENT_ARRAY_BUFFER,
            bytemuck_cast_slice(&data.indices),
            glow::STATIC_DRAW,
        );

        gl.bind_vertex_array(None);

        GpuMesh {
            vao,
            _vbo: vbo,
            ibo,
            index_count: data.indices.len() as i32,
        }
    }
}

fn upload_lines(gl: &glow::Context, data: &LineMeshData) -> GpuLines {
    unsafe {
        let vao = gl.create_vertex_array().unwrap();
        gl.bind_vertex_array(Some(vao));

        let vbo = gl.create_buffer().unwrap();
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(vbo));
        gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            bytemuck_cast_slice(&data.vertices),
            glow::STATIC_DRAW,
        );

        let stride = 7 * 4; // 7 floats * 4 bytes
        // position: location 0
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_f32(0, 3, glow::FLOAT, false, stride, 0);
        // color: location 1
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_f32(1, 4, glow::FLOAT, false, stride, 3 * 4);

        gl.bind_vertex_array(None);

        GpuLines {
            vao,
            _vbo: vbo,
            vertex_count: (data.vertices.len() / 7) as i32,
        }
    }
}

// ── Draw calls ───────────────────────────────────────────────

unsafe fn draw_mesh(gl: &glow::Context, mesh: &GpuMesh) {
    gl.bind_vertex_array(Some(mesh.vao));
    gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(mesh.ibo));
    gl.draw_elements(glow::TRIANGLES, mesh.index_count, glow::UNSIGNED_INT, 0);
    gl.bind_vertex_array(None);
}

unsafe fn draw_lines(gl: &glow::Context, lines: &GpuLines) {
    gl.bind_vertex_array(Some(lines.vao));
    gl.draw_arrays(glow::LINES, 0, lines.vertex_count);
    gl.bind_vertex_array(None);
}

// ── Shader compilation ───────────────────────────────────────

fn compile_program(gl: &glow::Context, vert_src: &str, frag_src: &str) -> glow::Program {
    unsafe {
        let program = gl.create_program().unwrap();

        let vert = gl.create_shader(glow::VERTEX_SHADER).unwrap();
        gl.shader_source(vert, vert_src);
        gl.compile_shader(vert);
        if !gl.get_shader_compile_status(vert) {
            let log = gl.get_shader_info_log(vert);
            tracing::error!("Vertex shader error: {log}");
        }

        let frag = gl.create_shader(glow::FRAGMENT_SHADER).unwrap();
        gl.shader_source(frag, frag_src);
        gl.compile_shader(frag);
        if !gl.get_shader_compile_status(frag) {
            let log = gl.get_shader_info_log(frag);
            tracing::error!("Fragment shader error: {log}");
        }

        gl.attach_shader(program, vert);
        gl.attach_shader(program, frag);
        gl.link_program(program);
        if !gl.get_program_link_status(program) {
            let log = gl.get_program_info_log(program);
            tracing::error!("Program link error: {log}");
        }

        gl.delete_shader(vert);
        gl.delete_shader(frag);

        program
    }
}

// ── Uniform setters ──────────────────────────────────────────

fn set_uniform_mat4(gl: &glow::Context, program: glow::Program, name: &str, mat: &glam::Mat4) {
    unsafe {
        let loc = gl.get_uniform_location(program, name);
        gl.uniform_matrix_4_f32_slice(loc.as_ref(), false, &mat.to_cols_array());
    }
}

fn set_uniform_vec3(gl: &glow::Context, program: glow::Program, name: &str, v: &glam::Vec3) {
    unsafe {
        let loc = gl.get_uniform_location(program, name);
        gl.uniform_3_f32(loc.as_ref(), v.x, v.y, v.z);
    }
}

// ── Byte cast helper ─────────────────────────────────────────

fn bytemuck_cast_slice<T: Copy>(slice: &[T]) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(
            slice.as_ptr() as *const u8,
            std::mem::size_of_val(slice),
        )
    }
}

// ── Shaders ──────────────────────────────────────────────────

const MESH_VERT: &str = r#"#version 330 core
uniform mat4 u_mvp;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 a_color;

out vec3 v_normal;
out vec3 v_color;

void main() {
    gl_Position = u_mvp * vec4(a_position, 1.0);
    v_normal = a_normal;
    v_color = a_color;
}
"#;

const MESH_FRAG: &str = r#"#version 330 core
uniform vec3 u_light_dir;

in vec3 v_normal;
in vec3 v_color;

out vec4 frag_color;

void main() {
    vec3 n = normalize(v_normal);
    float diffuse = max(dot(n, u_light_dir), 0.0);
    float ambient = 0.25;
    float light = ambient + diffuse * 0.75;
    frag_color = vec4(v_color * light, 1.0);
}
"#;

const LINE_VERT: &str = r#"#version 330 core
uniform mat4 u_mvp;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;

out vec4 v_color;

void main() {
    gl_Position = u_mvp * vec4(a_position, 1.0);
    v_color = a_color;
}
"#;

const LINE_FRAG: &str = r#"#version 330 core
in vec4 v_color;
out vec4 frag_color;

void main() {
    frag_color = v_color;
}
"#;
