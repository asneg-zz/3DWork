//! Application settings

use serde::{Deserialize, Serialize};

/// Unit system for display
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum Units {
    #[default]
    Millimeters,
    Centimeters,
    Meters,
    Inches,
}

impl Units {
    /// Get the abbreviation for this unit
    pub fn abbrev(&self) -> &'static str {
        match self {
            Units::Millimeters => "mm",
            Units::Centimeters => "cm",
            Units::Meters => "m",
            Units::Inches => "in",
        }
    }

    /// Get the display name for this unit
    pub fn display_name(&self) -> &'static str {
        match self {
            Units::Millimeters => "Millimeters",
            Units::Centimeters => "Centimeters",
            Units::Meters => "Meters",
            Units::Inches => "Inches",
        }
    }

    /// Conversion factor to base units (millimeters)
    pub fn to_mm(&self) -> f64 {
        match self {
            Units::Millimeters => 1.0,
            Units::Centimeters => 10.0,
            Units::Meters => 1000.0,
            Units::Inches => 25.4,
        }
    }

    /// All available units
    pub fn all() -> &'static [Units] {
        &[Units::Millimeters, Units::Centimeters, Units::Meters, Units::Inches]
    }
}

/// Grid display settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridSettings {
    /// Show grid
    pub visible: bool,
    /// Grid cell size in current units
    pub size: f32,
    /// Number of grid lines in each direction from origin
    pub range: i32,
    /// Grid line opacity (0.0 - 1.0)
    pub opacity: f32,
}

impl Default for GridSettings {
    fn default() -> Self {
        Self {
            visible: true,
            size: 1.0,
            range: 5,
            opacity: 0.6,
        }
    }
}

/// Axis display settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AxisSettings {
    /// Show axes
    pub visible: bool,
    /// Axis arrow length
    pub length: f32,
    /// Axis line thickness
    pub thickness: f32,
    /// Show axis labels (X, Y, Z)
    pub show_labels: bool,
}

impl Default for AxisSettings {
    fn default() -> Self {
        Self {
            visible: true,
            length: 1.5,
            thickness: 2.0,
            show_labels: true,
        }
    }
}

/// Viewport settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewportSettings {
    /// Background color RGB
    pub background_color: [u8; 3],
    /// Selection color RGB
    pub selection_color: [u8; 3],
    /// Enable anti-aliasing
    pub antialiasing: bool,
}

impl Default for ViewportSettings {
    fn default() -> Self {
        Self {
            background_color: [30, 30, 35],
            selection_color: [0, 220, 255],
            antialiasing: true,
        }
    }
}

/// Snap settings for sketching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapSettings {
    /// Enable snapping
    pub enabled: bool,
    /// Snap to grid
    pub grid: bool,
    /// Snap to endpoints
    pub endpoints: bool,
    /// Snap to midpoints
    pub midpoints: bool,
    /// Snap to intersections
    pub intersections: bool,
    /// Snap radius in pixels
    pub radius: f32,
}

impl Default for SnapSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            grid: true,
            endpoints: true,
            midpoints: true,
            intersections: true,
            radius: 10.0,
        }
    }
}

/// UI settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiSettings {
    /// Font size in points
    pub font_size: f32,
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            font_size: 14.0,
        }
    }
}

/// Dimension display settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DimensionSettings {
    /// Font size for dimension values
    pub font_size: f32,
    /// Number of decimal places for dimension values
    pub precision: usize,
    /// Show dimension units suffix
    pub show_units: bool,
}

impl Default for DimensionSettings {
    fn default() -> Self {
        Self {
            font_size: 14.0,
            precision: 2,
            show_units: false,
        }
    }
}

/// All application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[derive(Default)]
pub struct AppSettings {
    /// Display units
    pub units: Units,
    /// Grid settings
    pub grid: GridSettings,
    /// Axis settings
    pub axes: AxisSettings,
    /// Viewport settings
    pub viewport: ViewportSettings,
    /// Snap settings
    pub snap: SnapSettings,
    /// UI settings
    pub ui: UiSettings,
    /// Dimension display settings
    #[serde(default)]
    pub dimensions: DimensionSettings,
}


impl AppSettings {
    /// Load settings from file, or return default if not found
    pub fn load() -> Self {
        if let Some(dirs) = directories::ProjectDirs::from("com", "vcad", "vcad") {
            let config_path = dirs.config_dir().join("settings.json");
            if let Ok(json) = std::fs::read_to_string(&config_path) {
                if let Ok(settings) = serde_json::from_str(&json) {
                    return settings;
                }
            }
        }
        Self::default()
    }

    /// Save settings to file
    pub fn save(&self) {
        if let Some(dirs) = directories::ProjectDirs::from("com", "vcad", "vcad") {
            let config_dir = dirs.config_dir();
            if std::fs::create_dir_all(config_dir).is_ok() {
                let config_path = config_dir.join("settings.json");
                if let Ok(json) = serde_json::to_string_pretty(self) {
                    let _ = std::fs::write(config_path, json);
                }
            }
        }
    }
}
