import { create } from "zustand";
import type {
  ObjectId,
  Point2D,
  SceneDescription,
  SceneOperation,
  SketchElement,
} from "../types/scene";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AppState {
  // Scene
  scene: SceneDescription;
  selectedObjectId: ObjectId | null;
  selectedObjectIds: ObjectId[];
  addOperation: (op: SceneOperation) => void;
  setOperations: (ops: SceneOperation[]) => void;
  clearScene: () => void;
  selectObject: (id: ObjectId | null) => void;
  toggleSelectObject: (id: ObjectId) => void;

  // Undo/Redo
  undoStack: SceneDescription[];
  redoStack: SceneDescription[];
  undo: () => void;
  redo: () => void;

  // Chat
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;

  // Sketch editing
  activeSketchId: ObjectId | null;
  sketchTool: string | null;
  drawingPoints: Point2D[];
  previewPoint: Point2D | null;
  selectedElementIndex: number | null;
  setActiveSketch: (id: ObjectId | null) => void;
  setSketchTool: (tool: string | null) => void;
  addDrawingPoint: (p: Point2D) => void;
  clearDrawing: () => void;
  setPreviewPoint: (p: Point2D | null) => void;
  enterSketchEdit: (id: ObjectId) => void;
  exitSketchEdit: () => void;
  updateSketchElements: (sketchId: ObjectId, elements: SketchElement[]) => void;
  selectElement: (index: number | null) => void;
  deleteElement: (sketchId: ObjectId, index: number) => void;
  updateElement: (sketchId: ObjectId, index: number, element: SketchElement) => void;

  // UI
  isLoading: boolean;
  setLoading: (v: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Scene
  scene: { operations: [] },
  selectedObjectId: null,
  selectedObjectIds: [],

  addOperation: (op) => {
    const { scene, undoStack } = get();
    set({
      undoStack: [...undoStack, { ...scene }],
      redoStack: [],
      scene: { operations: [...scene.operations, op] },
    });
  },

  setOperations: (ops) => {
    const { scene, undoStack } = get();
    set({
      undoStack: [...undoStack, { ...scene }],
      redoStack: [],
      scene: { operations: ops },
    });
  },

  clearScene: () => {
    const { scene, undoStack } = get();
    set({
      undoStack: [...undoStack, { ...scene }],
      redoStack: [],
      scene: { operations: [] },
      selectedObjectId: null,
      selectedObjectIds: [],
    });
  },

  selectObject: (id) =>
    set({ selectedObjectId: id, selectedObjectIds: id ? [id] : [] }),
  toggleSelectObject: (id) => {
    const { selectedObjectIds } = get();
    const has = selectedObjectIds.includes(id);
    const newIds = has
      ? selectedObjectIds.filter((x) => x !== id)
      : [...selectedObjectIds, id];
    set({
      selectedObjectIds: newIds,
      selectedObjectId: newIds.length > 0 ? newIds[newIds.length - 1] : null,
    });
  },

  // Undo/Redo
  undoStack: [],
  redoStack: [],

  undo: () => {
    const { undoStack, scene, redoStack } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, { ...scene }],
      scene: prev,
    });
  },

  redo: () => {
    const { redoStack, scene, undoStack } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, { ...scene }],
      scene: next,
    });
  },

  // Chat
  chatMessages: [],
  addChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  clearChat: () => set({ chatMessages: [] }),

  // Sketch editing
  activeSketchId: null,
  sketchTool: null,
  drawingPoints: [],
  previewPoint: null,
  selectedElementIndex: null,
  setActiveSketch: (id) => set({ activeSketchId: id }),
  setSketchTool: (tool) => set({ sketchTool: tool, drawingPoints: [], previewPoint: null, selectedElementIndex: null }),
  addDrawingPoint: (p) =>
    set((s) => ({ drawingPoints: [...s.drawingPoints, p] })),
  clearDrawing: () => set({ drawingPoints: [], previewPoint: null }),
  setPreviewPoint: (p) => set({ previewPoint: p }),
  enterSketchEdit: (id) =>
    set({
      activeSketchId: id,
      selectedObjectId: id,
      selectedObjectIds: [id],
      sketchTool: null,
      drawingPoints: [],
      previewPoint: null,
      selectedElementIndex: null,
    }),
  exitSketchEdit: () =>
    set({
      activeSketchId: null,
      sketchTool: null,
      drawingPoints: [],
      previewPoint: null,
      selectedElementIndex: null,
    }),
  updateSketchElements: (sketchId, elements) => {
    const { scene, undoStack } = get();
    const newOps = scene.operations.map((op) => {
      if (op.type === "create_sketch" && op.id === sketchId) {
        return { ...op, sketch: { ...op.sketch, elements } };
      }
      return op;
    });
    set({
      undoStack: [...undoStack, { ...scene }],
      redoStack: [],
      scene: { operations: newOps },
    });
  },
  selectElement: (index) => set({ selectedElementIndex: index }),
  deleteElement: (sketchId, index) => {
    const { scene, undoStack } = get();
    const newOps = scene.operations.map((op) => {
      if (op.type === "create_sketch" && op.id === sketchId) {
        const newElements = op.sketch.elements.filter((_, i) => i !== index);
        return { ...op, sketch: { ...op.sketch, elements: newElements } };
      }
      return op;
    });
    set({
      undoStack: [...undoStack, { ...scene }],
      redoStack: [],
      scene: { operations: newOps },
      selectedElementIndex: null,
    });
  },
  updateElement: (sketchId, index, element) => {
    const { scene, undoStack } = get();
    const newOps = scene.operations.map((op) => {
      if (op.type === "create_sketch" && op.id === sketchId) {
        const newElements = op.sketch.elements.map((el, i) =>
          i === index ? element : el
        );
        return { ...op, sketch: { ...op.sketch, elements: newElements } };
      }
      return op;
    });
    set({
      undoStack: [...undoStack, { ...scene }],
      redoStack: [],
      scene: { operations: newOps },
    });
  },

  // UI
  isLoading: false,
  setLoading: (v) => set({ isLoading: v }),
}));
