import { useEffect, useRef } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color3,
  Color4,
  SceneLoader,
  GizmoManager,
  MeshBuilder,
  StandardMaterial,
  HighlightLayer,
  PointerEventTypes,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { useStore } from "../../store/useStore";
import { buildSceneGlb, isServerReady } from "../../wasm/bridge";
import type {
  SceneDescription,
  SketchPlane,
  SketchElement,
  Point2D,
} from "../../types/scene";
import { pickPointOnPlane, getCameraForPlane, dist2D, angle2D } from "../../utils/sketchMath";
import { renderSketchElements, renderPreviewElement } from "../../utils/sketchRenderer";

interface SavedCamera {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
}

export function Viewport() {
  console.log("[Viewport] RENDER");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const gizmoRef = useRef<GizmoManager | null>(null);
  const highlightRef = useRef<HighlightLayer | null>(null);
  const buildVersionRef = useRef(0);
  const savedCameraRef = useRef<SavedCamera | null>(null);

  const scene = useStore((s) => s.scene);
  const selectObject = useStore((s) => s.selectObject);
  const activeSketchId = useStore((s) => s.activeSketchId);
  const sketchTool = useStore((s) => s.sketchTool);
  const drawingPoints = useStore((s) => s.drawingPoints);
  const previewPoint = useStore((s) => s.previewPoint);
  const selectedElementIndex = useStore((s) => s.selectedElementIndex);
  const selectedObjectIds = useStore((s) => s.selectedObjectIds);

  // Initialize Babylon.js
  useEffect(() => {
    console.log("[Viewport] useEffect INIT, canvas:", canvasRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    const bScene = new Scene(engine);
    bScene.clearColor = new Color4(0.15, 0.15, 0.18, 1);
    sceneRef.current = bScene;

    const camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 4,
      Math.PI / 3,
      30,
      Vector3.Zero(),
      bScene
    );
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 200;
    camera.wheelDeltaPercentage = 0.02;
    camera.attachControl(canvas, true);
    cameraRef.current = camera;

    const hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), bScene);
    hemiLight.intensity = 0.5;

    const dirLight = new DirectionalLight("dir", new Vector3(-1, -2, -1), bScene);
    dirLight.intensity = 0.7;

    createGrid(bScene);

    const hl = new HighlightLayer("selection_hl", bScene);
    hl.outerGlow = true;
    hl.innerGlow = false;
    highlightRef.current = hl;

    const gizmo = new GizmoManager(bScene);
    gizmo.positionGizmoEnabled = true;
    gizmo.rotationGizmoEnabled = false;
    gizmo.scaleGizmoEnabled = false;
    gizmo.boundingBoxGizmoEnabled = false;
    gizmo.usePointerToAttachGizmos = false; // отключаем авто-привязку — обрабатываем вручную
    gizmoRef.current = gizmo;

    const onCanvasPointerDown = (evt: PointerEvent) => {
      console.log("[Viewport] canvas pointerdown", evt.button, "ctrl:", evt.ctrlKey);

      if (evt.button !== 0) return; // только левая кнопка

      const state = useStore.getState();
      if (state.activeSketchId && state.sketchTool) return;

      const pickResult = bScene.pick(bScene.pointerX, bScene.pointerY);
      const isMultiSelect = evt.ctrlKey || evt.metaKey;

      console.log("[Viewport] pick:", pickResult?.hit, pickResult?.pickedMesh?.name);

      if (pickResult?.hit && pickResult.pickedMesh) {
        const name = pickResult.pickedMesh.name;
        if (name !== "__grid__" && !name.startsWith("__sketch_")) {
          if (isMultiSelect) {
            useStore.getState().toggleSelectObject(name);
          } else {
            selectObject(name);
          }
          gizmo.attachToMesh(pickResult.pickedMesh);
          console.log("[Viewport] selected:", useStore.getState().selectedObjectIds);
        }
      } else if (!isMultiSelect) {
        selectObject(null);
        gizmo.attachToMesh(null);
      }
    };
    canvas.addEventListener("pointerdown", onCanvasPointerDown);

    engine.runRenderLoop(() => {
      bScene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      canvas.removeEventListener("pointerdown", onCanvasPointerDown);
      window.removeEventListener("resize", handleResize);
      hl.dispose();
      gizmo.dispose();
      engine.dispose();
    };
  }, []);

  // Update highlight on selected objects
  useEffect(() => {
    const bScene = sceneRef.current;
    const hl = highlightRef.current;
    if (!bScene || !hl) return;

    hl.removeAllMeshes();
    const highlightColor = new Color3(0.2, 0.8, 1);
    for (const id of selectedObjectIds) {
      const mesh = bScene.getMeshByName(id);
      if (mesh) {
        hl.addMesh(mesh, highlightColor);
      }
    }
  }, [selectedObjectIds, scene]);

  // Rebuild scene when operations change
  useEffect(() => {
    const bScene = sceneRef.current;
    if (!bScene) return;

    const version = ++buildVersionRef.current;
    rebuildScene(bScene, scene, version, buildVersionRef, activeSketchId, selectedElementIndex);
  }, [scene, activeSketchId, selectedElementIndex]);

  // Sketch mode: camera transition + gizmo toggle
  useEffect(() => {
    const camera = cameraRef.current;
    const gizmo = gizmoRef.current;
    if (!camera || !gizmo) return;

    if (activeSketchId) {
      // Найти операцию эскиза
      const sketchOp = scene.operations.find(
        (op) => op.type === "create_sketch" && op.id === activeSketchId
      );
      if (!sketchOp || sketchOp.type !== "create_sketch") return;

      // Сохранить текущую камеру
      savedCameraRef.current = {
        alpha: camera.alpha,
        beta: camera.beta,
        radius: camera.radius,
        target: camera.target.clone(),
      };

      // Переключить камеру на ортогональный вид
      const { alpha, beta } = getCameraForPlane(sketchOp.sketch.plane);
      camera.alpha = alpha;
      camera.beta = beta;
      camera.target = Vector3.Zero();

      // Отключить гизмо
      gizmo.positionGizmoEnabled = false;
    } else {
      // Восстановить камеру
      if (savedCameraRef.current) {
        camera.alpha = savedCameraRef.current.alpha;
        camera.beta = savedCameraRef.current.beta;
        camera.radius = savedCameraRef.current.radius;
        camera.target = savedCameraRef.current.target;
        savedCameraRef.current = null;
      }

      // Включить гизмо
      gizmo.positionGizmoEnabled = true;
    }
  }, [activeSketchId]);

  // Sketch drawing: mouse handlers
  useEffect(() => {
    const bScene = sceneRef.current;
    if (!bScene || !activeSketchId || !sketchTool) return;

    const sketchOp = scene.operations.find(
      (op) => op.type === "create_sketch" && op.id === activeSketchId
    );
    if (!sketchOp || sketchOp.type !== "create_sketch") return;

    const { plane, offset } = sketchOp.sketch;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastClickTime = 0;

    const onPointerMove = (evt: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      const pt = pickPointOnPlane(bScene, x, y, plane, offset);
      useStore.getState().setPreviewPoint(pt);
    };

    const onPointerDown = (evt: PointerEvent) => {
      if (evt.button !== 0) return; // только левая кнопка

      const rect = canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      const pt = pickPointOnPlane(bScene, x, y, plane, offset);
      if (!pt) return;

      const now = Date.now();
      const isDoubleClick = now - lastClickTime < 350;
      lastClickTime = now;

      const state = useStore.getState();
      const tool = state.sketchTool;
      const points = state.drawingPoints;

      if (!tool) return;

      // Полилиния/сплайн: двойной клик завершает
      if (isDoubleClick && (tool === "polyline" || tool === "spline") && points.length >= 2) {
        finishElement(activeSketchId, tool, points, sketchOp.sketch.elements);
        return;
      }

      const newPoints = [...points, pt];
      useStore.getState().addDrawingPoint(pt);

      // Проверяем, готов ли элемент
      switch (tool) {
        case "line":
        case "dimension":
          if (newPoints.length >= 2) {
            finishElement(activeSketchId, tool, newPoints, sketchOp.sketch.elements);
          }
          break;
        case "circle":
          if (newPoints.length >= 2) {
            finishElement(activeSketchId, tool, newPoints, sketchOp.sketch.elements);
          }
          break;
        case "arc":
          if (newPoints.length >= 3) {
            finishElement(activeSketchId, tool, newPoints, sketchOp.sketch.elements);
          }
          break;
        case "rectangle":
          if (newPoints.length >= 2) {
            finishElement(activeSketchId, tool, newPoints, sketchOp.sketch.elements);
          }
          break;
        // polyline, spline — завершение по двойному клику
      }
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);

    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      useStore.getState().setPreviewPoint(null);
    };
  }, [activeSketchId, sketchTool, scene]);

  // Render preview element
  useEffect(() => {
    const bScene = sceneRef.current;
    if (!bScene) return;

    if (!activeSketchId || !sketchTool) {
      renderPreviewElement(bScene, null, "XY", 0);
      return;
    }

    const sketchOp = scene.operations.find(
      (op) => op.type === "create_sketch" && op.id === activeSketchId
    );
    if (!sketchOp || sketchOp.type !== "create_sketch") return;

    const { plane, offset } = sketchOp.sketch;
    const preview = buildPreviewElement(sketchTool, drawingPoints, previewPoint);
    renderPreviewElement(bScene, preview, plane, offset);
  }, [activeSketchId, sketchTool, drawingPoints, previewPoint, scene]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", outline: "none" }}
    />
  );
}

// --- Вспомогательные функции ---

function finishElement(
  sketchId: string,
  tool: string,
  points: Point2D[],
  existingElements: SketchElement[]
) {
  const el = createElementFromPoints(tool, points);
  if (el) {
    useStore.getState().updateSketchElements(sketchId, [...existingElements, el]);
  }
  useStore.getState().clearDrawing();
}

function createElementFromPoints(
  tool: string,
  points: Point2D[]
): SketchElement | null {
  switch (tool) {
    case "line":
      if (points.length < 2) return null;
      return { type: "line", start: points[0], end: points[1] };
    case "circle":
      if (points.length < 2) return null;
      return {
        type: "circle",
        center: points[0],
        radius: dist2D(points[0], points[1]),
      };
    case "arc":
      if (points.length < 3) return null;
      return {
        type: "arc",
        center: points[0],
        radius: dist2D(points[0], points[1]),
        startAngle: angle2D(points[0], points[1]),
        endAngle: angle2D(points[0], points[2]),
      };
    case "rectangle": {
      if (points.length < 2) return null;
      const [a, b] = points;
      const corner = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
      return {
        type: "rectangle",
        corner,
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      };
    }
    case "polyline":
      if (points.length < 2) return null;
      return { type: "polyline", points: [...points] };
    case "spline":
      if (points.length < 2) return null;
      return { type: "spline", points: [...points] };
    case "dimension":
      if (points.length < 2) return null;
      return {
        type: "dimension",
        from: points[0],
        to: points[1],
        value: dist2D(points[0], points[1]),
      };
    default:
      return null;
  }
}

function buildPreviewElement(
  tool: string,
  points: Point2D[],
  previewPoint: Point2D | null
): SketchElement | null {
  if (!previewPoint || points.length === 0) return null;

  const allPoints = [...points, previewPoint];
  return createElementFromPoints(tool, allPoints);
}

function createGrid(scene: Scene) {
  const gridMat = new StandardMaterial("gridMat", scene);
  gridMat.wireframe = true;
  gridMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
  gridMat.alpha = 0.4;

  const ground = MeshBuilder.CreateGround(
    "__grid__",
    { width: 100, height: 100, subdivisions: 20 },
    scene
  );
  ground.material = gridMat;
  ground.isPickable = false;
}

function clearUserMeshes(bScene: Scene) {
  const toRemove = bScene.meshes.filter((m) => m.name !== "__grid__");
  toRemove.forEach((m) => m.dispose());

  const matsToRemove = bScene.materials.filter((m) => m.name !== "gridMat");
  matsToRemove.forEach((m) => m.dispose());
}

async function rebuildScene(
  bScene: Scene,
  sceneDesc: SceneDescription,
  version: number,
  versionRef: React.MutableRefObject<number>,
  activeSketchId: string | null,
  selectedElementIndex: number | null
) {
  clearUserMeshes(bScene);

  if (sceneDesc.operations.length === 0) return;

  if (isServerReady()) {
    const hasBooleans = sceneDesc.operations.some((op) => op.type === "boolean");

    if (hasBooleans) {
      try {
        const glb = await buildSceneGlb(sceneDesc);
        if (glb && versionRef.current === version) {
          clearUserMeshes(bScene);
          const blob = new Blob([glb as unknown as ArrayBuffer], {
            type: "model/gltf-binary",
          });
          const url = URL.createObjectURL(blob);
          await SceneLoader.AppendAsync("", url, bScene, undefined, ".glb");
          URL.revokeObjectURL(url);
          return;
        }
      } catch (e) {
        console.warn("Server build failed, falling back to mock:", e);
      }
    }
  }

  if (versionRef.current === version) {
    buildMockScene(bScene, sceneDesc, activeSketchId, selectedElementIndex);
  }
}

function buildMockScene(
  bScene: Scene,
  sceneDesc: SceneDescription,
  activeSketchId: string | null,
  selectedElementIndex: number | null
) {
  const defaultMat = new StandardMaterial("defaultMat", bScene);
  defaultMat.diffuseColor = new Color3(0.4, 0.6, 0.9);
  defaultMat.specularColor = new Color3(0.2, 0.2, 0.2);

  for (const op of sceneDesc.operations) {
    if (op.type === "create_primitive") {
      let mesh;
      const { primitive, id, transform } = op;

      switch (primitive.type) {
        case "cube":
          mesh = MeshBuilder.CreateBox(
            id,
            { width: primitive.width, height: primitive.height, depth: primitive.depth },
            bScene
          );
          break;
        case "cylinder":
          mesh = MeshBuilder.CreateCylinder(
            id,
            { diameter: primitive.radius * 2, height: primitive.height },
            bScene
          );
          break;
        case "sphere":
          mesh = MeshBuilder.CreateSphere(
            id,
            { diameter: primitive.radius * 2 },
            bScene
          );
          break;
        case "cone":
          mesh = MeshBuilder.CreateCylinder(
            id,
            { diameterTop: 0, diameterBottom: primitive.radius * 2, height: primitive.height },
            bScene
          );
          break;
      }

      if (mesh) {
        mesh.material = defaultMat;
        mesh.position = new Vector3(...transform.position);
        mesh.rotation = new Vector3(...transform.rotation);
        mesh.scaling = new Vector3(...transform.scale);
      }
    } else if (op.type === "create_sketch") {
      const isActive = op.id === activeSketchId;
      buildSketchPlane(bScene, op.id, op.sketch.plane, op.sketch.offset, isActive);

      // Отрисовка элементов эскиза
      if (op.sketch.elements.length > 0) {
        renderSketchElements(
          bScene,
          op.sketch.elements,
          op.sketch.plane,
          op.sketch.offset,
          `__sketch_el_${op.id}`,
          isActive ? selectedElementIndex : null
        );
      }
    }
  }
}

const SKETCH_PLANE_SIZE = 20;

function getSketchPlaneColor(plane: SketchPlane): Color3 {
  switch (plane) {
    case "XY":
      return new Color3(0.2, 0.3, 0.8);
    case "XZ":
      return new Color3(0.2, 0.7, 0.3);
    case "YZ":
      return new Color3(0.8, 0.2, 0.2);
  }
}

function buildSketchPlane(
  bScene: Scene,
  id: string,
  plane: SketchPlane,
  offset: number,
  isActive: boolean
) {
  const color = getSketchPlaneColor(plane);

  const mat = new StandardMaterial(`__sketch_mat_${id}`, bScene);
  mat.diffuseColor = color;
  mat.alpha = isActive ? 0.3 : 0.15;
  mat.backFaceCulling = false;

  const planeMesh = MeshBuilder.CreatePlane(
    `__sketch_plane_${id}`,
    { size: SKETCH_PLANE_SIZE },
    bScene
  );
  planeMesh.material = mat;
  planeMesh.isPickable = false;

  switch (plane) {
    case "XY":
      planeMesh.position = new Vector3(0, 0, offset);
      break;
    case "XZ":
      planeMesh.rotation = new Vector3(Math.PI / 2, 0, 0);
      planeMesh.position = new Vector3(0, offset, 0);
      break;
    case "YZ":
      planeMesh.rotation = new Vector3(0, Math.PI / 2, 0);
      planeMesh.position = new Vector3(offset, 0, 0);
      break;
  }

  const borderMat = new StandardMaterial(`__sketch_border_${id}`, bScene);
  borderMat.diffuseColor = color;
  borderMat.alpha = isActive ? 0.8 : 0.5;
  borderMat.wireframe = true;

  const border = MeshBuilder.CreatePlane(
    `__sketch_border_mesh_${id}`,
    { size: SKETCH_PLANE_SIZE },
    bScene
  );
  border.material = borderMat;
  border.isPickable = false;
  border.position = planeMesh.position.clone();
  border.rotation = planeMesh.rotation.clone();
}
