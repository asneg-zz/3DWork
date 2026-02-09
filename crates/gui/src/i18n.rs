use std::sync::atomic::{AtomicU8, Ordering};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Ru,
    En,
}

static CURRENT_LANG: AtomicU8 = AtomicU8::new(0); // 0=Ru (default)

pub fn lang() -> Lang {
    match CURRENT_LANG.load(Ordering::Relaxed) {
        1 => Lang::En,
        _ => Lang::Ru,
    }
}

pub fn set_lang(l: Lang) {
    CURRENT_LANG.store(
        match l {
            Lang::Ru => 0,
            Lang::En => 1,
        },
        Ordering::Relaxed,
    );
}

/// Translate a key to the current language.
pub fn t(key: &str) -> &'static str {
    let ru = lang() == Lang::Ru;
    match key {
        // ── Main menus ──────────────────────────────────────
        "menu.file" => if ru { "Файл" } else { "File" },
        "menu.new" => if ru { "Новая сцена" } else { "New scene" },
        "menu.open" => if ru { "Открыть сцену..." } else { "Open Scene..." },
        "menu.open_title" => if ru { "Открыть JSON сцены" } else { "Open Scene JSON" },
        "menu.save" => if ru { "Сохранить сцену..." } else { "Save Scene..." },
        "menu.save_title" => if ru { "Сохранить JSON сцены" } else { "Save Scene JSON" },
        "menu.export_glb" => if ru { "Экспорт GLB..." } else { "Export GLB..." },
        "menu.export_glb_title" => if ru { "Экспорт GLB" } else { "Export GLB" },
        "menu.quit" => if ru { "Выход" } else { "Quit" },

        "menu.edit" => if ru { "Правка" } else { "Edit" },
        "menu.undo" => if ru { "Отменить  Ctrl+Z" } else { "Undo  Ctrl+Z" },
        "menu.redo" => if ru { "Повторить  Ctrl+Shift+Z" } else { "Redo  Ctrl+Shift+Z" },
        "menu.duplicate" => if ru { "Дублировать  Ctrl+D" } else { "Duplicate  Ctrl+D" },
        "menu.delete" => if ru { "Удалить  Del" } else { "Delete  Del" },
        "menu.select_all" => if ru { "Выделить всё" } else { "Select all" },
        "menu.deselect_all" => if ru { "Снять выделение  Esc" } else { "Deselect all  Esc" },

        "menu.view" => if ru { "Вид" } else { "View" },
        "menu.scene_tree" => if ru { "Дерево сцены" } else { "Scene tree" },
        "menu.properties" => if ru { "Свойства" } else { "Properties" },
        "menu.ai_chat" => if ru { "AI Чат" } else { "AI Chat" },
        "menu.reset_camera" => if ru { "Сбросить камеру" } else { "Reset camera" },
        "menu.language" => if ru { "Язык" } else { "Language" },

        "menu.create" => if ru { "Создать" } else { "Create" },
        "menu.primitives" => if ru { "Примитивы" } else { "Primitives" },
        "menu.sketch" => if ru { "Эскиз" } else { "Sketch" },
        "menu.features" => if ru { "Операции" } else { "Features" },
        "menu.on_xy" => if ru { "на плоскости XY" } else { "on XY plane" },
        "menu.on_xz" => if ru { "на плоскости XZ" } else { "on XZ plane" },
        "menu.on_yz" => if ru { "на плоскости YZ" } else { "on YZ plane" },
        "menu.extrude" => if ru { "Выдавливание  E" } else { "Extrude  E" },
        "menu.revolve" => if ru { "Вращение" } else { "Revolve" },

        // ── Primitives ──────────────────────────────────────
        "prim.cube" => if ru { "Куб" } else { "Cube" },
        "prim.cylinder" => if ru { "Цилиндр" } else { "Cylinder" },
        "prim.sphere" => if ru { "Сфера" } else { "Sphere" },
        "prim.cone" => if ru { "Конус" } else { "Cone" },

        // ── Toolbar ─────────────────────────────────────────
        "tb.primitives" => if ru { "Примитивы" } else { "Primitives" },
        "tb.boolean" => if ru { "Булевы" } else { "Boolean" },
        "tb.union" => if ru { "Объединение" } else { "Union" },
        "tb.diff" => if ru { "Вычитание" } else { "Diff" },
        "tb.intersect" => if ru { "Пересечение" } else { "Intersect" },
        "tb.sketch" => if ru { "Эскиз" } else { "Sketch" },
        "tb.features" => if ru { "Операции" } else { "Features" },
        "tb.extrude" => if ru { "Выдавить" } else { "Extrude" },
        "tb.revolve" => if ru { "Вращение" } else { "Revolve" },
        "tb.cut" => if ru { "Вырезать" } else { "Cut" },
        "tb.undo" => if ru { "Отменить" } else { "Undo" },
        "tb.redo" => if ru { "Повторить" } else { "Redo" },
        "tb.clear_all" => if ru { "Очистить" } else { "Clear all" },

        "tip.cube" => if ru { "Создать куб (1x1x1)" } else { "Create a cube (1x1x1)" },
        "tip.cylinder" => if ru { "Создать цилиндр (r=0.5, h=1)" } else { "Create a cylinder (r=0.5, h=1)" },
        "tip.sphere" => if ru { "Создать сферу (r=0.5)" } else { "Create a sphere (r=0.5)" },
        "tip.cone" => if ru { "Создать конус (r=0.5, h=1)" } else { "Create a cone (r=0.5, h=1)" },
        "tip.union" => if ru { "Объединить два объекта (выберите 2)" } else { "Merge two objects (select 2)" },
        "tip.diff" => if ru { "Вычесть второй из первого (выберите 2)" } else { "Subtract second from first (select 2)" },
        "tip.intersect" => if ru { "Оставить только пересечение (выберите 2)" } else { "Keep only intersection (select 2)" },
        "tip.xy" => if ru { "Новый эскиз на плоскости XY" } else { "New sketch on XY plane" },
        "tip.xz" => if ru { "Новый эскиз на плоскости XZ" } else { "New sketch on XZ plane" },
        "tip.yz" => if ru { "Новый эскиз на плоскости YZ" } else { "New sketch on YZ plane" },
        "tip.extrude" => if ru { "Выдавить выбранный эскиз (E)" } else { "Extrude selected sketch (E)" },
        "tip.revolve" => if ru { "Тело вращения из эскиза" } else { "Revolve selected sketch around axis" },
        "tip.cut" => if ru { "Вырезать эскиз из выбранного объекта" } else { "Cut sketch from selected object" },
        "tip.undo" => if ru { "Отменить (Ctrl+Z)" } else { "Undo (Ctrl+Z)" },
        "tip.redo" => if ru { "Повторить (Ctrl+Shift+Z)" } else { "Redo (Ctrl+Shift+Z)" },
        "tip.clear_all" => if ru { "Удалить все объекты" } else { "Remove all objects" },

        // ── Scene tree ──────────────────────────────────────
        "tree.scene" => if ru { "Сцена" } else { "Scene" },
        "tree.no_objects" => if ru { "Объектов нет." } else { "No objects yet." },
        "tree.use_toolbar" => if ru { "Используйте панель или меню Создать" } else { "Use the toolbar or Create menu" },
        "tree.to_add" => if ru { "для добавления примитивов и эскизов." } else { "to add primitives and sketches." },
        "tree.empty_sketch" => if ru { "(пустой эскиз)" } else { "(empty sketch)" },
        "tree.show" => if ru { "Показать" } else { "Show" },
        "tree.hide" => if ru { "Скрыть" } else { "Hide" },
        "tree.edit_sketch" => if ru { "Редактировать эскиз" } else { "Edit sketch" },
        "tree.finish_edit" => if ru { "Завершить редактирование" } else { "Finish editing" },
        "tree.delete" => if ru { "Удалить" } else { "Delete" },
        "tree.delete_feature" => if ru { "Удалить элемент" } else { "Delete Feature" },
        "tree.create_body" => if ru { "Создать тело" } else { "Create Body" },
        "tree.new_body" => if ru { "Новое тело" } else { "New Body" },
        "tree.add_feature" => if ru { "Добавить" } else { "Add" },
        "tree.add_primitive" => if ru { "Примитив" } else { "Primitive" },
        "tree.add_sketch" => if ru { "Эскиз" } else { "Sketch" },
        "tree.select_left" => if ru { "Выбрать левый операнд" } else { "Select left operand" },
        "tree.select_right" => if ru { "Выбрать правый операнд" } else { "Select right operand" },
        "tree.select_sketch" => if ru { "Выбрать исходный эскиз" } else { "Select source sketch" },
        "tree.select_target" => if ru { "Выбрать целевой объект" } else { "Select target object" },
        "tree.base_sketch" => if ru { "Базовый эскиз" } else { "Base Sketch" },
        "tree.empty_body" => if ru { "(пустое тело)" } else { "(empty body)" },

        // ── Operation Dialog ─────────────────────────────────
        "dialog.extrude_title" => if ru { "Выдавливание" } else { "Extrude" },
        "dialog.cut_title" => if ru { "Вырез" } else { "Cut" },
        "dialog.height_forward" => if ru { "Высота вперёд:" } else { "Height forward:" },
        "dialog.height_backward" => if ru { "Высота назад:" } else { "Height backward:" },
        "dialog.draft_angle" => if ru { "Угол уклона:" } else { "Draft angle:" },
        "dialog.draft_hint" => if ru { "+ расширение, - сужение" } else { "+ widens, - narrows" },
        "dialog.ok" => if ru { "ОК" } else { "OK" },
        "dialog.cancel" => if ru { "Отмена" } else { "Cancel" },
        "ctx.edit_operation" => if ru { "Редактировать операцию" } else { "Edit Operation" },

        // ── Properties ──────────────────────────────────────
        "prop.title" => if ru { "Свойства" } else { "Properties" },
        "prop.select_object" => if ru { "Выберите объект" } else { "Select an object" },
        "prop.to_view" => if ru { "для просмотра свойств." } else { "to view its properties." },
        "prop.dimensions" => if ru { "Размеры" } else { "Dimensions" },
        "prop.width" => if ru { "Ширина" } else { "Width" },
        "prop.height" => if ru { "Высота" } else { "Height" },
        "prop.depth" => if ru { "Глубина" } else { "Depth" },
        "prop.radius" => if ru { "Радиус" } else { "Radius" },
        "prop.operation" => if ru { "Операция" } else { "Operation" },
        "prop.type" => if ru { "Тип" } else { "Type" },
        "prop.swap" => if ru { "Поменять L ↔ R" } else { "Swap L ↔ R" },
        "prop.swap_tip" => if ru { "Поменять левый и правый операнды" } else { "Swap left and right operands" },
        "prop.transform" => if ru { "Трансформация" } else { "Transform" },
        "prop.pos" => if ru { "Поз:" } else { "Pos:" },
        "prop.rot" => if ru { "Вращ:" } else { "Rot:" },
        "prop.scale" => if ru { "Масш:" } else { "Scale:" },
        "prop.parameters" => if ru { "Параметры" } else { "Parameters" },
        "prop.plane" => if ru { "Плоскость:" } else { "Plane:" },
        "prop.offset" => if ru { "Смещение:" } else { "Offset:" },
        "prop.elements" => if ru { "Элементы:" } else { "Elements:" },
        "prop.sketch_label" => if ru { "Эскиз:" } else { "Sketch:" },
        "prop.height_label" => if ru { "Высота:" } else { "Height:" },
        "prop.angle" => if ru { "Угол:" } else { "Angle:" },
        "prop.segments" => if ru { "Сегменты:" } else { "Segments:" },
        "prop.target" => if ru { "Цель:" } else { "Target:" },
        "prop.not_found" => if ru { "Объект не найден." } else { "Object not found." },
        "prop.body_info" => if ru { "Информация о теле" } else { "Body Info" },
        "prop.visible" => if ru { "Видимость" } else { "Visible" },
        "prop.features" => if ru { "Операции" } else { "Features" },
        "prop.elem_props" => if ru { "Свойства элемента" } else { "Element Properties" },
        "prop.elem_selection" => if ru { "Выбранные элементы" } else { "Selected Elements" },
        "prop.selected_count" => if ru { "Выбрано" } else { "Selected" },
        "prop.operands" => if ru { "Операнды" } else { "Operands" },
        "prop.left" => if ru { "Левый:" } else { "Left:" },
        "prop.right" => if ru { "Правый:" } else { "Right:" },

        // ── Face selection ─────────────────────────────────
        "prop.face" => if ru { "Грань" } else { "Face" },
        "prop.face_props" => if ru { "Свойства грани" } else { "Face Properties" },
        "prop.normal" => if ru { "Нормаль" } else { "Normal" },
        "prop.area" => if ru { "Площадь" } else { "Area" },
        "prop.triangles" => if ru { "Треугольников" } else { "Triangles" },
        "status.face_selected" => if ru { "Грань выбрана" } else { "Face selected" },
        "hint.shift_face" => if ru { "Shift+клик для выбора грани" } else { "Shift+click to select face" },

        // ── Boolean ops ─────────────────────────────────────
        "bool.union" => if ru { "Объединение" } else { "Union" },
        "bool.difference" => if ru { "Вычитание" } else { "Difference" },
        "bool.intersection" => if ru { "Пересечение" } else { "Intersection" },

        // ── Sketch elements ─────────────────────────────────
        "elem.line" => if ru { "Линия" } else { "Line" },
        "elem.circle" => if ru { "Окружность" } else { "Circle" },
        "elem.arc" => if ru { "Дуга" } else { "Arc" },
        "elem.rect" => if ru { "Прямоугольник" } else { "Rectangle" },
        "elem.polyline" => if ru { "Полилиния" } else { "Polyline" },
        "elem.spline" => if ru { "Сплайн" } else { "Spline" },
        "elem.dimension" => if ru { "Размер" } else { "Dimension" },

        // Short forms for scene tree
        "elem.rect_short" => if ru { "Прямоуг" } else { "Rect" },
        "elem.dim_short" => if ru { "Разм" } else { "Dim" },

        // ── Sketch tools ────────────────────────────────────
        "tool.select" => if ru { "Выбор" } else { "Select" },
        "tool.line" => if ru { "Линия" } else { "Line" },
        "tool.circle" => if ru { "Окружность" } else { "Circle" },
        "tool.arc" => if ru { "Дуга" } else { "Arc" },
        "tool.rectangle" => if ru { "Прямоугольник" } else { "Rectangle" },
        "tool.polyline" => if ru { "Полилиния" } else { "Polyline" },
        "tool.spline" => if ru { "Сплайн" } else { "Spline" },
        "tool.dimension" => if ru { "Размер" } else { "Dimension" },
        "tool.trim" => if ru { "Обрезка" } else { "Trim" },
        "tool.fillet" => if ru { "Скругление" } else { "Fillet" },
        "tool.offset" => if ru { "Смещение" } else { "Offset" },
        "tool.radius" => if ru { "Радиус:" } else { "Radius:" },
        "tool.distance" => if ru { "Расст.:" } else { "Dist.:" },

        // ── Sketch toolbar ──────────────────────────────────
        "stb.sketch" => if ru { "Эскиз:" } else { "Sketch:" },
        "stb.done" => if ru { "Готово" } else { "Done" },

        // ── Chat panel ──────────────────────────────────────
        "chat.title" => if ru { "AI Чат" } else { "AI Chat" },
        "chat.clear" => if ru { "Очистить" } else { "Clear" },
        "chat.clear_tip" => if ru { "Очистить историю чата" } else { "Clear chat history" },
        "chat.placeholder" => if ru { "Опишите, что создать..." } else { "Describe what to create..." },
        "chat.examples" => if ru { "Примеры:" } else { "Examples:" },
        "chat.example1" => if ru { "Создай стол с четырьмя ножками" } else { "Create a table with four legs" },
        "chat.example2" => if ru { "Добавь сферу на куб" } else { "Add a sphere on top of the cube" },
        "chat.example3" => if ru { "Создай цилиндр радиусом 2" } else { "Make a cylinder with radius 2" },
        "chat.thinking" => if ru { "Думаю..." } else { "Thinking..." },
        "chat.ask" => if ru { "Спросить AI..." } else { "Ask AI..." },
        "chat.send_tip" => if ru { "Отправить (Enter)" } else { "Send (Enter)" },
        "chat.retry" => if ru { "Повторить" } else { "Retry" },
        "chat.undo_hint" => if ru { "(Ctrl+Z для отмены)" } else { "(Ctrl+Z to undo)" },
        "chat.you" => if ru { "Вы" } else { "You" },

        // ── Status bar ──────────────────────────────────────
        "status.ready" => if ru { "Готово" } else { "Ready" },
        "status.objects" => if ru { "Объектов" } else { "Objects" },
        "status.bodies" => if ru { "Тел" } else { "Bodies" },
        "status.selected" => if ru { "Выбрано" } else { "Selected" },
        "status.ai_thinking" => if ru { "AI думает..." } else { "AI thinking..." },
        "status.select_tool" => if ru { "Выберите инструмент на панели эскиза" } else { "Select a tool from the sketch toolbar" },
        "status.nav_hint" => if ru { "СКМ: Вращение | ПКМ: Панорама | Скролл: Масштаб" } else { "MMB: Rotate | RMB: Pan | Scroll: Zoom" },

        // Status hints per tool
        "hint.line_start" => if ru { "Кликните для начальной точки" } else { "Click to place start point" },
        "hint.line_end" => if ru { "Кликните для конечной точки" } else { "Click to place end point" },
        "hint.circle_center" => if ru { "Кликните для центра" } else { "Click to place center" },
        "hint.circle_radius" => if ru { "Кликните для задания радиуса" } else { "Click to set radius" },
        "hint.rect_corner1" => if ru { "Кликните первый угол" } else { "Click first corner" },
        "hint.rect_corner2" => if ru { "Кликните противоположный угол" } else { "Click opposite corner" },
        "hint.arc_center" => if ru { "Кликните для центра" } else { "Click to place center" },
        "hint.arc_radius" => if ru { "Кликните для радиуса и начального угла" } else { "Click to set radius and start angle" },
        "hint.arc_end" => if ru { "Кликните для конечного угла" } else { "Click to set end angle" },
        "hint.dim_from" => if ru { "Кликните начальную точку" } else { "Click 'from' point" },
        "hint.dim_to" => if ru { "Кликните конечную точку" } else { "Click 'to' point" },
        "hint.poly_add" => if ru { "Кликните для добавления точки | ПКМ для завершения" } else { "Click to add point | RMB to finish" },
        "hint.trim" => if ru { "Кликните сегмент для обрезки" } else { "Click segment to trim" },
        "hint.fillet" => if ru { "Кликните угол для скругления" } else { "Click corner to fillet" },
        "hint.offset" => if ru { "Кликните элемент для смещения" } else { "Click element to offset" },
        "hint.esc" => if ru { "Esc для отмены/выхода" } else { "Esc to cancel/exit" },
        "hint.sketch_prefix" => if ru { "ЭСКИЗ" } else { "SKETCH" },

        // ── Context menu (viewport) ─────────────────────────
        "ctx.focus" => if ru { "Фокус" } else { "Focus" },
        "ctx.show" => if ru { "Показать" } else { "Show" },
        "ctx.hide" => if ru { "Скрыть" } else { "Hide" },
        "ctx.duplicate" => if ru { "Дублировать" } else { "Duplicate" },
        "ctx.sketch_on_face" => if ru { "Эскиз на грани" } else { "Sketch on face" },
        "ctx.edit_sketch" => if ru { "Редактировать эскиз" } else { "Edit sketch" },
        "ctx.finish_edit" => if ru { "Завершить редактирование" } else { "Finish editing" },
        "ctx.delete" => if ru { "Удалить" } else { "Delete" },

        // ── Snap (привязки) ─────────────────────────────────
        "snap.enabled" => if ru { "Привязки" } else { "Snap" },
        "snap.endpoint" => if ru { "Конец" } else { "End" },
        "snap.midpoint" => if ru { "Середина" } else { "Mid" },
        "snap.center" => if ru { "Центр" } else { "Center" },
        "snap.quadrant" => if ru { "Квадрант" } else { "Quad" },
        "snap.intersection" => if ru { "Пересечение" } else { "Intersect" },
        "snap.grid" => if ru { "Сетка" } else { "Grid" },

        // ── Settings menu ──────────────────────────────────
        "menu.settings" => if ru { "Настройки" } else { "Settings" },
        "menu.preferences" => if ru { "Параметры..." } else { "Preferences..." },

        // ── Settings window ────────────────────────────────
        "settings.title" => if ru { "Настройки" } else { "Settings" },
        "settings.general" => if ru { "Общие" } else { "General" },
        "settings.units" => if ru { "Единицы измерения" } else { "Units" },
        "settings.mm" => if ru { "Миллиметры" } else { "Millimeters" },
        "settings.cm" => if ru { "Сантиметры" } else { "Centimeters" },
        "settings.m" => if ru { "Метры" } else { "Meters" },
        "settings.in" => if ru { "Дюймы" } else { "Inches" },

        "settings.grid" => if ru { "Сетка" } else { "Grid" },
        "settings.grid_visible" => if ru { "Показывать сетку" } else { "Show grid" },
        "settings.grid_size" => if ru { "Размер ячейки" } else { "Cell size" },
        "settings.grid_range" => if ru { "Количество линий" } else { "Grid lines" },
        "settings.grid_opacity" => if ru { "Прозрачность" } else { "Opacity" },

        "settings.axes" => if ru { "Оси координат" } else { "Axes" },
        "settings.axes_visible" => if ru { "Показывать оси" } else { "Show axes" },
        "settings.axes_length" => if ru { "Длина стрелок" } else { "Arrow length" },
        "settings.axes_thickness" => if ru { "Толщина линий" } else { "Line thickness" },
        "settings.axes_labels" => if ru { "Показывать метки" } else { "Show labels" },

        "settings.viewport" => if ru { "Вьюпорт" } else { "Viewport" },
        "settings.bg_color" => if ru { "Цвет фона" } else { "Background color" },
        "settings.sel_color" => if ru { "Цвет выделения" } else { "Selection color" },
        "settings.antialiasing" => if ru { "Сглаживание" } else { "Anti-aliasing" },

        "settings.snap" => if ru { "Привязки" } else { "Snapping" },
        "settings.snap_enabled" => if ru { "Включить привязки" } else { "Enable snapping" },
        "settings.snap_grid" => if ru { "К сетке" } else { "Snap to grid" },
        "settings.snap_endpoints" => if ru { "К концам" } else { "Snap to endpoints" },
        "settings.snap_midpoints" => if ru { "К серединам" } else { "Snap to midpoints" },
        "settings.snap_intersections" => if ru { "К пересечениям" } else { "Snap to intersections" },
        "settings.snap_radius" => if ru { "Радиус захвата (пикс.)" } else { "Snap radius (px)" },

        "settings.ui" => if ru { "Интерфейс" } else { "Interface" },
        "settings.font_size" => if ru { "Размер шрифта" } else { "Font size" },

        "settings.apply" => if ru { "Применить" } else { "Apply" },
        "settings.reset" => if ru { "Сбросить" } else { "Reset" },
        "settings.close" => if ru { "Закрыть" } else { "Close" },

        // ── Fallback ────────────────────────────────────────
        _ => "???",
    }
}
