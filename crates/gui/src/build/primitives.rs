//! Primitive creation and transform helpers

use shared::{Primitive, Transform};
use vcad::{centered_cube, Part};

pub const DEFAULT_SEGMENTS: u32 = 32;

/// Create a vcad Part from a shared::Primitive
pub fn create_primitive(id: &str, primitive: &Primitive) -> Part {
    match primitive {
        Primitive::Cube {
            width,
            height,
            depth,
        } => centered_cube(id, *width, *height, *depth),
        Primitive::Cylinder { radius, height } => {
            Part::cylinder(id, *radius, *height, DEFAULT_SEGMENTS)
        }
        Primitive::Sphere { radius } => Part::sphere(id, *radius, DEFAULT_SEGMENTS),
        Primitive::Cone { radius, height } => {
            Part::cone(id, *radius, 0.0, *height, DEFAULT_SEGMENTS)
        }
    }
}

/// Apply a Transform to a vcad Part
pub fn apply_transform(part: Part, transform: &Transform) -> Part {
    let [tx, ty, tz] = transform.position;
    let [rx, ry, rz] = transform.rotation;
    let [sx, sy, sz] = transform.scale;

    let mut p = part;
    if sx != 1.0 || sy != 1.0 || sz != 1.0 {
        p = p.scale(sx, sy, sz);
    }
    if rx != 0.0 || ry != 0.0 || rz != 0.0 {
        p = p.rotate(rx, ry, rz);
    }
    if tx != 0.0 || ty != 0.0 || tz != 0.0 {
        p = p.translate(tx, ty, tz);
    }
    p
}
