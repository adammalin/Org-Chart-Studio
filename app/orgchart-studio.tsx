"use client";

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import { ArrowsOut } from "@phosphor-icons/react/ArrowsOut";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { Archive } from "@phosphor-icons/react/Archive";
import { AlignBottom } from "@phosphor-icons/react/AlignBottom";
import { AlignCenterHorizontal } from "@phosphor-icons/react/AlignCenterHorizontal";
import { AlignCenterVertical } from "@phosphor-icons/react/AlignCenterVertical";
import { AlignLeft } from "@phosphor-icons/react/AlignLeft";
import { AlignRight } from "@phosphor-icons/react/AlignRight";
import { AlignTop } from "@phosphor-icons/react/AlignTop";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { Check } from "@phosphor-icons/react/Check";
import { ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { CloudArrowUp } from "@phosphor-icons/react/CloudArrowUp";
import { Copy } from "@phosphor-icons/react/Copy";
import { Columns } from "@phosphor-icons/react/Columns";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileArrowUp } from "@phosphor-icons/react/FileArrowUp";
import { FileCsv } from "@phosphor-icons/react/FileCsv";
import { FileLock } from "@phosphor-icons/react/FileLock";
import { FilePdf } from "@phosphor-icons/react/FilePdf";
import { FilePpt } from "@phosphor-icons/react/FilePpt";
import { FloppyDisk } from "@phosphor-icons/react/FloppyDisk";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { HardDrives } from "@phosphor-icons/react/HardDrives";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MapPin } from "@phosphor-icons/react/MapPin";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { PushPin } from "@phosphor-icons/react/PushPin";
import { Robot } from "@phosphor-icons/react/Robot";
import { Rows } from "@phosphor-icons/react/Rows";
import { Selection } from "@phosphor-icons/react/Selection";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { SquaresFour } from "@phosphor-icons/react/SquaresFour";
import { Table } from "@phosphor-icons/react/Table";
import { TreeStructure } from "@phosphor-icons/react/TreeStructure";
import { Trash } from "@phosphor-icons/react/Trash";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { WarningDiamond } from "@phosphor-icons/react/WarningDiamond";
import { X } from "@phosphor-icons/react/X";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  arrangeSelectedNodes,
  descendantIds,
  positionBranchNodesFromSnapshot,
  runElkLayout,
  selectionMovementIds,
  validateHierarchy,
  type OrgFlowNode,
  type OrganizationalUnit,
  type PositionStatus,
  type SelectionArrangement,
  type UnitType,
  type ValidationFinding,
} from "../lib/org-chart";
import {
  type ChartDocument,
  type ChartLibraryResponse,
  type ChartVersion,
  type ChartVersionsResponse,
} from "../lib/chart-library";
import {
  aiIntakeBrief,
  importTemplateCsv,
  type ImportPreview,
} from "../lib/import-org-chart";
import { decryptLibraryBackup, encryptLibraryBackup } from "../lib/encrypted-backup";
import type { LibraryBackup } from "../lib/backup-format";
import {
  EXPORT_PRESETS,
  buildAccessibleTableCsv,
  buildChartExportScene,
  buildChartSvg,
  resolveExportViewport,
  safeExportFileStem,
  type ExportAudience,
  type ExportPresetId,
} from "../lib/chart-export";
import {
  buildOrthogonalEdgeRoutes,
  edgeRoutePath,
  sourcePortOffset,
  type ConnectorRoutingMode,
  type OrthogonalEdgeRoute,
} from "../lib/edge-routing";

type LayoutMode = "preserve" | "branch" | "respect-pins" | "full";
type WorkspaceView = "library" | "canvas" | "table" | "sources" | "history" | "exports";
type ExportFormat = "svg" | "png" | "pdf" | "pptx";

const CONNECTOR_ROUTING_STORAGE_KEY = "orgchart-studio-connector-routing-mode";
const CONNECTOR_ROUTING_EVENT = "orgchart-studio-connector-routing-change";

function connectorRoutingSnapshot(): ConnectorRoutingMode {
  const storedMode = window.localStorage.getItem(CONNECTOR_ROUTING_STORAGE_KEY);
  return storedMode === "combed" ? "combed" : "separate";
}

function subscribeToConnectorRouting(callback: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === CONNECTOR_ROUTING_STORAGE_KEY) callback();
  };
  window.addEventListener(CONNECTOR_ROUTING_EVENT, callback);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CONNECTOR_ROUTING_EVENT, callback);
    window.removeEventListener("storage", handleStorage);
  };
}

interface EditorSnapshot {
  nodes: OrgFlowNode[];
  edges: Edge[];
  selectedId: string;
  label: string;
}

interface BranchDragState {
  rootId: string;
  branchIds: Set<string>;
  startingPositions: Map<string, { x: number; y: number }>;
}

interface GroupDragState {
  rootId: string;
  selectedNodeIds: Set<string>;
  movementNodeIds: Set<string>;
  startingPositions: Map<string, { x: number; y: number }>;
}

type EditorDialogState =
  | { kind: "create-chart"; name: string }
  | { kind: "add-child"; name: string; parentName: string }
  | {
      kind: "edit-chart";
      chartId: string;
      name: string;
      description: string;
    };

const statusLabels = {
  filled: "Filled",
  acting: "Acting",
  vacant: "Vacant",
};

const selectionArrangementLabels: Record<SelectionArrangement, string> = {
  "align-left": "aligning selected cards left",
  "align-horizontal-center": "centering selected cards horizontally",
  "align-right": "aligning selected cards right",
  "align-top": "aligning selected cards to the top",
  "align-vertical-center": "centering selected cards vertically",
  "align-bottom": "aligning selected cards to the bottom",
  "distribute-horizontal": "distributing selected cards horizontally",
  "distribute-vertical": "distributing selected cards vertically",
};

function cloneEditorNodes(nodes: OrgFlowNode[]): OrgFlowNode[] {
  return nodes.map((flowNode) => ({
    ...flowNode,
    position: { ...flowNode.position },
    data: {
      ...flowNode.data,
      unit: { ...flowNode.data.unit },
    },
  }));
}

function cloneEditorEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    data: edge.data ? { ...edge.data } : undefined,
  }));
}

function editorSnapshot(
  nodes: OrgFlowNode[],
  edges: Edge[],
  selectedId: string,
  label: string,
): EditorSnapshot {
  return {
    nodes: cloneEditorNodes(nodes),
    edges: cloneEditorEdges(edges),
    selectedId,
    label,
  };
}

function OrgUnitNode({ id, data, selected }: NodeProps<OrgFlowNode>) {
  const { unit } = data;
  const hasChildren = Boolean(data.childCount);
  const sourceHandleCount = Math.max(1, data.sourcePortCount ?? data.childCount ?? 0);

  return (
    <article
      className={`org-node org-node--${unit.type} ${
        selected ? "is-selected" : ""
      } ${data.isSearchMatch ? "is-search-match" : ""}`}
      aria-label={`${unit.name}, ${unit.positionTitle}, ${statusLabels[unit.positionStatus]}`}
    >
      <Handle
        id="parent"
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ left: `calc(50% + ${data.targetPortOffset ?? 0}px)` }}
      />
      <div className="org-node__eyebrow">
        <span>{unit.type}</span>
        {data.pinned ? (
          <span className="org-node__pin" title="Manual placement pinned">
            <PushPin size={13} weight="fill" aria-hidden="true" />
            <span className="sr-only">Pinned</span>
          </span>
        ) : null}
      </div>
      <h3>{unit.shortName}</h3>
      <p>{unit.positionTitle}</p>
      <div className={`org-node__status status--${unit.positionStatus}`}>
        <span className="status-marker" aria-hidden="true" />
        <span>{
          unit.positionStatus === "filled"
            ? unit.assignmentLabel
            : statusLabels[unit.positionStatus]
        }</span>
      </div>
      {hasChildren ? (
        <button
          type="button"
          className="org-node__collapse nodrag"
          onClick={(event) => {
            event.stopPropagation();
            data.onToggleCollapse?.(id);
          }}
          aria-label={`${data.collapsed ? "Expand" : "Collapse"} ${unit.name}`}
          aria-expanded={!data.collapsed}
        >
          {data.collapsed ? (
            <CaretRight size={13} aria-hidden="true" />
          ) : (
            <CaretDown size={13} aria-hidden="true" />
          )}
          <span>{data.childCount}</span>
        </button>
      ) : null}
      {Array.from({ length: sourceHandleCount }, (_, index) => (
        <Handle
          key={`route-${index}`}
          id={`route-${index}`}
          type="source"
          position={Position.Bottom}
          isConnectable={false}
          style={{
            left: `calc(50% + ${sourcePortOffset(index, sourceHandleCount, NODE_WIDTH)}px)`,
          }}
        />
      ))}
    </article>
  );
}

const nodeTypes = { orgUnit: OrgUnitNode };

function OrgRelationshipEdge({
  id,
  data,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
}: EdgeProps) {
  const route = data?.route as OrthogonalEdgeRoute | undefined;
  if (!route) return null;
  const path = edgeRoutePath(route);

  return (
    <>
      <path className="org-relationship-edge__halo" d={path} />
      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          strokeLinecap: "square",
          strokeLinejoin: "miter",
        }}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
      />
    </>
  );
}

const edgeTypes = { orgRelationship: OrgRelationshipEdge };

function StudioWorkspace() {
  const [nodes, setNodes, onNodesChange] = useNodesState<OrgFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [charts, setCharts] = useState<ChartDocument[]>([]);
  const [activeChartId, setActiveChartId] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [selectedId, setSelectedId] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("respect-pins");
  const [moveBranchOnDrag, setMoveBranchOnDrag] = useState(true);
  const [marqueeSelectionEnabled, setMarqueeSelectionEnabled] = useState(false);
  const connectorRoutingMode = useSyncExternalStore<ConnectorRoutingMode>(
    subscribeToConnectorRouting,
    connectorRoutingSnapshot,
    (): ConnectorRoutingMode => "separate",
  );
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("library");
  const [notice, setNotice] = useState(
    "Chart library ready. It contains only charts that staff create or import; no personnel system or AI endpoint is connected.",
  );
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [importName, setImportName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importEvidenceFiles, setImportEvidenceFiles] = useState<File[]>([]);
  const [importFindings, setImportFindings] = useState<ValidationFinding[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importReviewed, setImportReviewed] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState("");
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupBusy, setBackupBusy] = useState<"export" | "restore" | null>(null);
  const [backupMessage, setBackupMessage] = useState("");
  const [desktopStorage, setDesktopStorage] = useState<DesktopStorageSettings | null>(null);
  const [storageMode, setStorageMode] = useState<"loading" | "desktop" | "browser">(
    "browser",
  );
  const [storageBusy, setStorageBusy] = useState<"data" | "backup" | "restart" | null>(
    null,
  );
  const [storageMessage, setStorageMessage] = useState("");
  const [versions, setVersions] = useState<ChartVersion[]>([]);
  const [versionSummary, setVersionSummary] = useState("");
  const [historyBusy, setHistoryBusy] = useState<"load" | "save" | "restore" | null>(null);
  const [compareVersionId, setCompareVersionId] = useState("");
  const [exportAudience, setExportAudience] = useState<ExportAudience>("internal");
  const [exportPreset, setExportPreset] = useState<ExportPresetId>("presentation-wide");
  const [pngScale, setPngScale] = useState<1 | 2 | 4>(2);
  const [exportBusy, setExportBusy] = useState<ExportFormat | null>(null);
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorSnapshot[]>([]);
  const [editorDialog, setEditorDialog] = useState<EditorDialogState | null>(null);
  const hydratedChartRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGenerationRef = useRef(0);
  const chartsRef = useRef<ChartDocument[]>([]);
  const dragStartSnapshotRef = useRef<EditorSnapshot | null>(null);
  const branchDragRef = useRef<BranchDragState | null>(null);
  const groupDragRef = useRef<GroupDragState | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { fitView } = useReactFlow<OrgFlowNode>();

  const activeChart = charts.find((chart) => chart.id === activeChartId) ?? charts[0];
  const version = activeChart
    ? `${activeChart.status.replace("_", " ").replace(/^./, (character) => character.toUpperCase())} v${activeChart.version}`
    : libraryLoading
      ? "Loading library"
      : "No chart selected";

  useEffect(() => {
    chartsRef.current = charts;
  }, [charts]);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.orgChartDesktop;
    if (!bridge) return;
    bridge
      .getStorageSettings()
      .then((settings) => {
        if (cancelled) return;
        setDesktopStorage(settings);
        setStorageMode("desktop");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStorageMode("desktop");
        setStorageMessage(
          error instanceof Error ? error.message : "Storage settings could not be loaded.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeConnectorRoutingMode = useCallback(
    (mode: ConnectorRoutingMode) => {
      window.localStorage.setItem(CONNECTOR_ROUTING_STORAGE_KEY, mode);
      window.dispatchEvent(new Event(CONNECTOR_ROUTING_EVENT));
      setNotice(
        mode === "combed"
          ? "Sibling combs enabled. Nearby same-row relationships from one parent may share a trunk; unrelated branches remain separate."
          : "Separate connector lanes enabled. Every relationship receives an independent non-overlapping route.",
      );
    },
    [],
  );

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const openChart = useCallback(
    (chart: ChartDocument, nextView: WorkspaceView = "canvas") => {
      hydratedChartRef.current = null;
      setActiveChartId(chart.id);
      setNodes(chart.nodes);
      setEdges(chart.edges);
      setSelectedId(chart.nodes[0]?.id ?? "");
      setCollapsedIds(new Set());
      setSearchQuery("");
      setUndoStack([]);
      setRedoStack([]);
      setVersions([]);
      setCompareVersionId("");
      setVersionSummary("");
      setWorkspaceView(nextView);
      window.requestAnimationFrame(() => {
        hydratedChartRef.current = chart.id;
        void fitView({ duration: 420, padding: 0.14 });
      });
    },
    [fitView, setEdges, setNodes],
  );

  useEffect(() => {
    let cancelled = false;
    const loadLibrary = async () => {
      try {
        const response = await fetch("/api/charts");
        if (!response.ok) throw new Error("Chart library could not be loaded.");
        const data = (await response.json()) as ChartLibraryResponse;
        if (cancelled) return;
        setCharts(data.charts);
        const nextChart =
          data.charts.find((chart) => chart.id === activeChartId) ?? data.charts[0];
        if (nextChart) openChart(nextChart, "library");
      } catch {
        if (!cancelled) {
          setSaveState("error");
          setNotice("Persistent chart storage is unavailable; no chart data was loaded.");
        }
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    };
    void loadLibrary();
    return () => {
      cancelled = true;
    };
    // The library is loaded once; chart switching is handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chartSnapshot = chartsRef.current.find((chart) => chart.id === activeChartId);
    if (!chartSnapshot || hydratedChartRef.current !== chartSnapshot.id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const saveGeneration = ++saveGenerationRef.current;
    setSaveState("saving");
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      const chartToSave: ChartDocument = {
        ...chartSnapshot,
        nodes,
        edges,
      };
      try {
        const sendSave = (chart: ChartDocument) =>
          fetch("/api/charts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "save", chart }),
          });
        let response = await sendSave(chartToSave);
        let data = (await response.json()) as {
          chart?: ChartDocument;
          error?: string;
          currentVersion?: number;
          currentUpdatedAt?: string;
        };
        if (
          response.status === 409 &&
          saveGeneration === saveGenerationRef.current &&
          data.currentUpdatedAt &&
          data.currentVersion
        ) {
          response = await sendSave({
            ...chartToSave,
            version: data.currentVersion,
            updatedAt: data.currentUpdatedAt,
          });
          data = (await response.json()) as typeof data;
        }
        if (!response.ok || !data.chart) throw new Error(data.error ?? "Save failed.");
        if (saveGeneration !== saveGenerationRef.current) return;
        setCharts((current) =>
          current.map((chart) => (chart.id === data.chart!.id ? data.chart! : chart)),
        );
        setSaveState("saved");
      } catch {
        if (saveGeneration === saveGenerationRef.current) setSaveState("error");
      }
    }, 700);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activeChartId, edges, nodes]);

  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>();
    collapsedIds.forEach((collapsedId) => {
      descendantIds(collapsedId, edges).forEach((descendantId) => {
        if (descendantId !== collapsedId) hidden.add(descendantId);
      });
    });
    return hidden;
  }, [collapsedIds, edges]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const routingNodes = useDeferredValue(nodes);

  const edgeRoutes = useMemo(
    () =>
      buildOrthogonalEdgeRoutes(
        routingNodes.map((flowNode) => ({
          id: flowNode.id,
          x: flowNode.position.x,
          y: flowNode.position.y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        })),
        edges,
        connectorRoutingMode,
      ),
    [connectorRoutingMode, edges, routingNodes],
  );

  const sourcePortCounts = useMemo(() => {
    const counts = new Map<string, number>();
    edgeRoutes.forEach((route) => {
      counts.set(route.sourceId, route.sourcePortCount);
    });
    return counts;
  }, [edgeRoutes]);

  const targetPortOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    const nodeById = new Map(routingNodes.map((flowNode) => [flowNode.id, flowNode]));
    edgeRoutes.forEach((route) => {
      const targetNode = nodeById.get(route.targetId);
      const endpoint = route.points.at(-1);
      if (!targetNode || !endpoint) return;
      offsets.set(
        route.targetId,
        endpoint.x - (targetNode.position.x + NODE_WIDTH / 2),
      );
    });
    return offsets;
  }, [edgeRoutes, routingNodes]);

  const displayNodes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return nodes.map((flowNode) => ({
      ...flowNode,
      hidden: hiddenIds.has(flowNode.id),
      data: {
        ...flowNode.data,
        collapsed: collapsedIds.has(flowNode.id),
        childCount: edges.filter((edge) => edge.source === flowNode.id).length,
        sourcePortCount: sourcePortCounts.get(flowNode.id) ?? 0,
        targetPortOffset: targetPortOffsets.get(flowNode.id) ?? 0,
        isSearchMatch:
          normalizedQuery.length > 1 &&
          [
            flowNode.data.unit.name,
            flowNode.data.unit.shortName,
            flowNode.data.unit.positionTitle,
            flowNode.data.unit.assignmentLabel,
          ].some((value) => value.toLowerCase().includes(normalizedQuery)),
        onToggleCollapse: toggleCollapse,
      },
    }));
  }, [collapsedIds, edges, hiddenIds, nodes, searchQuery, sourcePortCounts, targetPortOffsets, toggleCollapse]);

  const displayEdges = useMemo(
    () => {
      return edges.map((edge) => {
        const route = edgeRoutes.get(edge.id);
        return {
          ...edge,
          type: "orgRelationship",
          selectable: false,
          focusable: false,
          sourceHandle: route?.sourceHandleId,
          targetHandle: route?.targetHandleId,
          data: { ...edge.data, route },
          hidden: hiddenIds.has(edge.source) || hiddenIds.has(edge.target),
        };
      });
    },
    [edgeRoutes, edges, hiddenIds],
  );

  const selectedNode =
    nodes.find((flowNode) => flowNode.id === selectedId) ?? nodes[0];
  const selectedCardCount = nodes.filter((flowNode) => flowNode.selected).length;
  const selectedParentEdge = edges.find((edge) => edge.target === selectedNode?.id);
  const findings = useMemo(
    () => (activeChart ? validateHierarchy(nodes, edges) : []),
    [activeChart, edges, nodes],
  );
  const blockingFindings = findings.filter((finding) => finding.severity === "blocking");
  const publicUnitCount = nodes.filter(
    (flowNode) => flowNode.data.unit.publicationVisibility === "public",
  ).length;
  const effectiveExportAudience: ExportAudience =
    exportAudience === "public" && publicUnitCount === 0 ? "internal" : exportAudience;
  const exportFit = useMemo(() => {
    if (!activeChart || !nodes.length) return null;
    try {
      const scene = buildChartExportScene(
        { ...activeChart, nodes, edges },
        effectiveExportAudience,
        activeChart.updatedAt,
        connectorRoutingMode,
      );
      return {
        scene,
        viewport: resolveExportViewport(scene, exportPreset),
        error: "",
      };
    } catch (error) {
      return {
        scene: null,
        viewport: null,
        error: error instanceof Error ? error.message : "This export profile is not valid.",
      };
    }
  }, [activeChart, connectorRoutingMode, edges, effectiveExportAudience, exportPreset, nodes]);
  const exportCardWidth = exportFit?.scene && exportFit.viewport
    ? exportFit.scene.nodes[0].width * exportFit.viewport.scale
    : 0;
  const exportProfileError = exportFit?.error ?? "";
  const selectedDescendantIds = selectedNode
    ? descendantIds(selectedNode.id, edges)
    : new Set<string>();
  const eligibleParents = nodes.filter(
    (flowNode) =>
      flowNode.id !== selectedNode?.id && !selectedDescendantIds.has(flowNode.id),
  );

  const pushUndoSnapshot = useCallback((snapshot: EditorSnapshot) => {
    setUndoStack((current) => [...current.slice(-39), snapshot]);
    setRedoStack([]);
  }, []);

  const recordCurrentState = useCallback(
    (label: string) => {
      pushUndoSnapshot(editorSnapshot(nodes, edges, selectedId, label));
    },
    [edges, nodes, pushUndoSnapshot, selectedId],
  );

  const positionDraggedBranch = useCallback(
    (flowNode: OrgFlowNode) => {
      const branchDrag = branchDragRef.current;
      if (!branchDrag || branchDrag.rootId !== flowNode.id) return;
      setNodes((currentNodes) =>
        positionBranchNodesFromSnapshot(
          currentNodes,
          branchDrag.branchIds,
          branchDrag.startingPositions,
          flowNode.id,
          flowNode.position,
        ),
      );
    },
    [setNodes],
  );

  const positionDraggedGroup = useCallback(
    (flowNode: OrgFlowNode) => {
      const groupDrag = groupDragRef.current;
      if (!groupDrag || groupDrag.rootId !== flowNode.id) return;
      setNodes((currentNodes) =>
        positionBranchNodesFromSnapshot(
          currentNodes,
          groupDrag.movementNodeIds,
          groupDrag.startingPositions,
          flowNode.id,
          flowNode.position,
        ),
      );
    },
    [setNodes],
  );

  const arrangeSelection = useCallback(
    (arrangement: SelectionArrangement) => {
      const minimumSelection = arrangement.startsWith("distribute-") ? 3 : 2;
      if (selectedCardCount < minimumSelection) {
        setNotice(
          minimumSelection === 3
            ? "Select at least three cards to distribute them."
            : "Select at least two cards to align them.",
        );
        return;
      }
      const label = selectionArrangementLabels[arrangement];
      recordCurrentState(label);
      setNodes((currentNodes) => arrangeSelectedNodes(currentNodes, arrangement));
      setNotice(
        `Applied ${label} to ${selectedCardCount} cards and pinned their positions. Only the selected cards moved; reporting lines did not change.`,
      );
    },
    [recordCurrentState, selectedCardCount, setNodes],
  );

  const undoChange = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((current) => [
      ...current.slice(-39),
      editorSnapshot(nodes, edges, selectedId, previous.label),
    ]);
    setUndoStack((current) => current.slice(0, -1));
    setNodes(cloneEditorNodes(previous.nodes));
    setEdges(cloneEditorEdges(previous.edges));
    setSelectedId(previous.selectedId);
    setNotice(`Undid ${previous.label}.`);
  }, [edges, nodes, selectedId, setEdges, setNodes, undoStack]);

  const redoChange = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((current) => [
      ...current.slice(-39),
      editorSnapshot(nodes, edges, selectedId, next.label),
    ]);
    setRedoStack((current) => current.slice(0, -1));
    setNodes(cloneEditorNodes(next.nodes));
    setEdges(cloneEditorEdges(next.edges));
    setSelectedId(next.selectedId);
    setNotice(`Redid ${next.label}.`);
  }, [edges, nodes, redoStack, selectedId, setEdges, setNodes]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) redoChange();
      else undoChange();
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [redoChange, undoChange]);

  useEffect(() => {
    if (!editorDialog) return;
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditorDialog(null);
    };
    window.addEventListener("keydown", handleDialogKeyDown);
    return () => window.removeEventListener("keydown", handleDialogKeyDown);
  }, [editorDialog]);

  const loadVersions = async (chartId: string) => {
    setHistoryBusy("load");
    try {
      const response = await fetch(
        `/api/charts?resource=versions&chartId=${encodeURIComponent(chartId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Version history could not be loaded.");
      const data = (await response.json()) as ChartVersionsResponse;
      setVersions(data.versions);
      setCompareVersionId((current) =>
        data.versions.some((versionItem) => versionItem.id === current)
          ? current
          : (data.versions[1]?.id ?? data.versions[0]?.id ?? ""),
      );
    } catch {
      setNotice("Version history could not be loaded. The working draft was not changed.");
    } finally {
      setHistoryBusy(null);
    }
  };

  const showVersionHistory = () => {
    setWorkspaceView("history");
    if (activeChart) void loadVersions(activeChart.id);
  };

  const saveVersionSnapshot = async () => {
    if (!activeChart || historyBusy) return;
    if (blockingFindings.length) {
      setNotice("Resolve blocking structural findings before saving a version.");
      return;
    }
    const label = versionSummary.trim();
    if (label.length < 3) {
      setNotice("Describe the reason for this saved version in at least three characters.");
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveGenerationRef.current += 1;
    setHistoryBusy("save");
    try {
      const response = await fetch("/api/charts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "snapshot",
          label,
          chart: { ...activeChart, nodes, edges },
        }),
      });
      const data = (await response.json()) as {
        chart?: ChartDocument;
        version?: ChartVersion;
        error?: string;
      };
      if (!response.ok || !data.chart) {
        throw new Error(data.error ?? "The version could not be saved.");
      }
      setCharts((current) =>
        current.map((chart) => (chart.id === data.chart!.id ? data.chart! : chart)),
      );
      if (data.version) {
        setVersions((current) => [data.version!, ...current]);
        setCompareVersionId(data.version.id);
      }
      setVersionSummary("");
      setSaveState("saved");
      setNotice(`Version ${data.chart.version} was saved: ${label}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The version could not be saved.");
    } finally {
      setHistoryBusy(null);
    }
  };

  const restoreSavedVersion = async (versionItem: ChartVersion) => {
    if (!activeChart || historyBusy) return;
    if (
      !window.confirm(
        `Restore the structure and layout from version ${versionItem.version}? A new version will be created; history will not be overwritten.`,
      )
    ) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveGenerationRef.current += 1;
    setHistoryBusy("restore");
    try {
      const response = await fetch("/api/charts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "restore_version",
          chartId: activeChart.id,
          versionId: versionItem.id,
        }),
      });
      const data = (await response.json()) as {
        chart?: ChartDocument;
        version?: ChartVersion;
        error?: string;
      };
      if (!response.ok || !data.chart) {
        throw new Error(data.error ?? "The saved version could not be restored.");
      }

      pushUndoSnapshot(
        editorSnapshot(nodes, edges, selectedId, `restoring version ${versionItem.version}`),
      );
      setNodes(data.chart.nodes);
      setEdges(data.chart.edges);
      setSelectedId(data.chart.nodes[0]?.id ?? "");
      setCharts((current) =>
        current.map((chart) => (chart.id === data.chart!.id ? data.chart! : chart)),
      );
      if (data.version) {
        setVersions((current) => [data.version!, ...current]);
        setCompareVersionId(data.version.id);
      }
      setSaveState("saved");
      setNotice(
        `Version ${versionItem.version} was restored as new version ${data.chart.version}.`,
      );
      window.requestAnimationFrame(() => {
        void fitView({ duration: 420, padding: 0.14 });
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The version could not be restored.");
    } finally {
      setHistoryBusy(null);
    }
  };

  const compareVersion = versions.find(
    (versionItem) => versionItem.id === compareVersionId,
  );
  const versionComparison = useMemo(() => {
    if (!compareVersion) return null;
    const currentById = new Map(nodes.map((flowNode) => [flowNode.id, flowNode]));
    const savedById = new Map(
      compareVersion.nodes.map((flowNode) => [flowNode.id, flowNode]),
    );
    const currentParents = new Map(edges.map((edge) => [edge.target, edge.source]));
    const savedParents = new Map(
      compareVersion.edges.map((edge) => [edge.target, edge.source]),
    );
    const added = nodes.filter((flowNode) => !savedById.has(flowNode.id));
    const removed = compareVersion.nodes.filter(
      (flowNode) => !currentById.has(flowNode.id),
    );
    const changed = nodes.filter((flowNode) => {
      const saved = savedById.get(flowNode.id);
      return (
        saved &&
        (JSON.stringify(saved.data.unit) !== JSON.stringify(flowNode.data.unit) ||
          savedParents.get(flowNode.id) !== currentParents.get(flowNode.id) ||
          saved.data.pinned !== flowNode.data.pinned ||
          saved.position.x !== flowNode.position.x ||
          saved.position.y !== flowNode.position.y)
      );
    });
    return { added, removed, changed };
  }, [compareVersion, edges, nodes]);

  const focusNode = useCallback(
    (id: string) => {
      setSelectedId(id);
      setWorkspaceView("canvas");
      window.requestAnimationFrame(() => {
        void fitView({ nodes: [{ id }], duration: 420, padding: 1.8 });
      });
    },
    [fitView],
  );

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    const query = value.trim().toLowerCase();
    if (query.length < 2) return;

    const match = nodes.find((flowNode) =>
      [
        flowNode.data.unit.name,
        flowNode.data.unit.shortName,
        flowNode.data.unit.positionTitle,
        flowNode.data.unit.assignmentLabel,
      ].some((candidate) => candidate.toLowerCase().includes(query)),
    );

    if (match) {
      setSelectedId(match.id);
      setCollapsedIds(new Set());
      window.requestAnimationFrame(() => {
        void fitView({ nodes: [{ id: match.id }], duration: 420, padding: 1.8 });
      });
    }
  };

  const handleNodeClick: NodeMouseHandler<OrgFlowNode> = (_event, flowNode) => {
    setSelectedId(flowNode.id);
  };

  const saveUnitChanges = (form: HTMLFormElement) => {
    if (!selectedNode) return;
    const formData = new FormData(form);
    const normalizedUnit: OrganizationalUnit = {
      ...selectedNode.data.unit,
      name: String(formData.get("name") ?? "").trim(),
      shortName: String(formData.get("shortName") ?? "").trim(),
      type: String(formData.get("type") ?? "group") as UnitType,
      positionTitle: String(formData.get("positionTitle") ?? "").trim(),
      assignmentLabel:
        String(formData.get("assignmentLabel") ?? "").trim() ||
        (formData.get("positionStatus") === "vacant"
          ? "Position vacant"
          : "Unassigned"),
      positionStatus: String(
        formData.get("positionStatus") ?? "vacant",
      ) as PositionStatus,
      effectiveDate:
        String(formData.get("effectiveDate") ?? "").trim() || "Current",
      source: String(formData.get("source") ?? "").trim() || "User-edited draft",
      publicationVisibility: String(
        formData.get("publicationVisibility") ?? "internal",
      ) as "internal" | "public",
    };
    const parentDraftId = String(formData.get("parentId") ?? "");

    if (!normalizedUnit.name || !normalizedUnit.shortName || !normalizedUnit.positionTitle) {
      setNotice("Name, display name, and position title are required.");
      return;
    }
    if (selectedParentEdge && !parentDraftId) {
      setNotice("Every non-root unit must have one primary parent.");
      return;
    }

    const nextNodes = nodes.map((flowNode) =>
      flowNode.id === selectedNode.id
        ? {
            ...flowNode,
            data: { ...flowNode.data, unit: normalizedUnit },
          }
        : flowNode,
    );
    let nextEdges = edges;
    if (selectedParentEdge && parentDraftId !== selectedParentEdge.source) {
      nextEdges = [
        ...edges.filter(
          (edge) =>
            !(
              edge.target === selectedNode.id &&
              (edge.data?.relationshipType ?? "primary supervisory") ===
                "primary supervisory"
            ),
        ),
        {
          id: `edge-${parentDraftId}-${selectedNode.id}`,
          source: parentDraftId,
          target: selectedNode.id,
          type: "smoothstep",
          data: { relationshipType: "primary supervisory" },
        },
      ];
    }

    const nextFindings = validateHierarchy(nextNodes, nextEdges);
    const blocking = nextFindings.find((finding) => finding.severity === "blocking");
    if (blocking) {
      setNotice(`Changes were not applied: ${blocking.message}`);
      return;
    }

    const unitChanged =
      JSON.stringify(selectedNode.data.unit) !== JSON.stringify(normalizedUnit);
    const parentChanged =
      Boolean(selectedParentEdge) && parentDraftId !== selectedParentEdge?.source;
    if (!unitChanged && !parentChanged) {
      setNotice("No organizational data changes were detected.");
      return;
    }

    recordCurrentState(`editing ${selectedNode.data.unit.shortName}`);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setNotice(
      parentChanged
        ? `${normalizedUnit.shortName} was updated and assigned a new semantic parent.`
        : `${normalizedUnit.shortName} was updated.`,
    );
  };

  const addChildUnit = (name: string) => {
    if (!selectedNode) return;

    const id = `unit-${crypto.randomUUID()}`;
    const childIndex = edges.filter((edge) => edge.source === selectedNode.id).length;
    const type: UnitType =
      selectedNode.data.unit.type === "laboratory"
        ? "directorate"
        : selectedNode.data.unit.type === "directorate"
          ? "division"
          : selectedNode.data.unit.type === "division"
            ? "section"
            : selectedNode.data.unit.type === "section"
              ? "group"
              : "team";
    const childNode: OrgFlowNode = {
      id,
      type: "orgUnit",
      position: {
        x: selectedNode.position.x + childIndex * 34,
        y: selectedNode.position.y + NODE_HEIGHT + 92,
      },
      data: {
        pinned: false,
        unit: {
          id,
          name,
          shortName: name,
          type,
          positionTitle: "Leadership position",
          assignmentLabel: "Position vacant",
          positionStatus: "vacant",
          effectiveDate: "Current",
          source: "User-created draft",
          publicationVisibility: "internal",
        },
      },
    };
    const childEdge: Edge = {
      id: `edge-${selectedNode.id}-${id}`,
      source: selectedNode.id,
      target: id,
      type: "smoothstep",
      data: { relationshipType: "primary supervisory" },
    };

    recordCurrentState(`adding ${name}`);
    setNodes([...nodes, childNode]);
    setEdges([...edges, childEdge]);
    setSelectedId(id);
    setCollapsedIds((current) => {
      const next = new Set(current);
      next.delete(selectedNode.id);
      return next;
    });
    setNotice(`${name} was added as a draft child unit. Review its fields, then save.`);
  };

  const requestAddChildUnit = () => {
    if (!selectedNode) return;
    setEditorDialog({
      kind: "add-child",
      name: "New organizational unit",
      parentName: selectedNode.data.unit.shortName,
    });
  };

  const deleteSelectedBranch = () => {
    if (!selectedNode || !selectedParentEdge) {
      setNotice("The chart root cannot be deleted here. Delete the chart from the library instead.");
      return;
    }
    const branchIds = descendantIds(selectedNode.id, edges);
    const branchLabel =
      branchIds.size === 1
        ? selectedNode.data.unit.shortName
        : `${selectedNode.data.unit.shortName} and ${branchIds.size - 1} descendant units`;
    if (!window.confirm(`Delete ${branchLabel}? You can undo this while the chart remains open.`)) {
      return;
    }

    recordCurrentState(`deleting ${selectedNode.data.unit.shortName}`);
    setNodes(nodes.filter((flowNode) => !branchIds.has(flowNode.id)));
    setEdges(
      edges.filter(
        (edge) => !branchIds.has(edge.source) && !branchIds.has(edge.target),
      ),
    );
    setSelectedId(selectedParentEdge.source);
    setNotice(
      branchIds.size === 1
        ? `${branchLabel} was removed from the draft.`
        : `${branchLabel} were removed from the draft.`,
    );
  };

  const runLayout = async () => {
    if (layoutMode === "preserve") {
      setNotice("Preserve mode kept all existing coordinates. No nodes needed placement.");
      return;
    }

    setIsLayoutRunning(true);
    try {
      if (layoutMode === "branch" && selectedNode) {
        const branchIds = descendantIds(selectedNode.id, edges);
        const branchNodes = nodes.filter((flowNode) => branchIds.has(flowNode.id));
        const branchEdges = edges.filter(
          (edge) => branchIds.has(edge.source) && branchIds.has(edge.target),
        );
        const layoutedBranch = await runElkLayout(branchNodes, branchEdges);
        const layoutRoot = layoutedBranch.find(
          (flowNode) => flowNode.id === selectedNode.id,
        );
        const offset = {
          x: selectedNode.position.x - (layoutRoot?.position.x ?? 0),
          y: selectedNode.position.y - (layoutRoot?.position.y ?? 0),
        };
        const branchById = new Map(
          layoutedBranch.map((flowNode) => [flowNode.id, flowNode]),
        );

        recordCurrentState(`laying out ${selectedNode.data.unit.shortName}`);
        setNodes((currentNodes) =>
          currentNodes.map((flowNode) => {
            const layouted = branchById.get(flowNode.id);
            if (!layouted || flowNode.data.pinned) return flowNode;
            return {
              ...flowNode,
              position: {
                x: layouted.position.x + offset.x,
                y: layouted.position.y + offset.y,
              },
            };
          }),
        );
        setNotice(`Branch layout completed for ${selectedNode.data.unit.shortName}.`);
      } else {
        const layouted = await runElkLayout(
          nodes,
          edges,
          layoutMode === "respect-pins",
        );
        recordCurrentState("laying out the chart");
        setNodes(layouted);
        setNotice(
          layoutMode === "respect-pins"
            ? "Layout completed; pinned cards retained their positions."
            : "Full hierarchy layout completed.",
        );
      }
      window.requestAnimationFrame(() => {
        void fitView({ duration: 500, padding: 0.14 });
      });
    } catch {
      setNotice("The layout service could not complete this request. Existing positions were preserved.");
    } finally {
      setIsLayoutRunning(false);
    }
  };

  const createChart = async (name: string) => {
    const response = await fetch("/api/charts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", name }),
    });
    if (!response.ok) {
      setNotice("The new chart could not be created.");
      return;
    }
    const data = (await response.json()) as { chart: ChartDocument };
    setCharts((current) => [data.chart, ...current]);
    openChart(data.chart);
    setNotice(`${data.chart.name} was created as a new draft.`);
  };

  const requestCreateChart = () => {
    setEditorDialog({ kind: "create-chart", name: "Untitled chart" });
  };

  const duplicateChart = async (chart: ChartDocument) => {
    const response = await fetch("/api/charts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "duplicate", chartId: chart.id }),
    });
    if (!response.ok) {
      setNotice("The chart could not be duplicated.");
      return;
    }
    const data = (await response.json()) as { chart: ChartDocument };
    setCharts((current) => [data.chart, ...current]);
    setNotice(`${data.chart.name} was created without duplicating source files.`);
  };

  const updateChartMetadata = async (
    chart: ChartDocument,
    patch: Partial<Pick<ChartDocument, "name" | "description" | "status">>,
  ) => {
    const currentStructure = chart.id === activeChartId
      ? { nodes, edges }
      : { nodes: chart.nodes, edges: chart.edges };
    if (chart.id === activeChartId) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveGenerationRef.current += 1;
    }
    try {
      const chartToSave = { ...chart, ...patch, ...currentStructure };
      const sendSave = (candidate: ChartDocument) =>
        fetch("/api/charts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save", chart: candidate }),
        });
      let response = await sendSave(chartToSave);
      let data = (await response.json()) as {
        chart?: ChartDocument;
        error?: string;
        currentVersion?: number;
        currentUpdatedAt?: string;
      };
      if (response.status === 409 && data.currentUpdatedAt && data.currentVersion) {
        response = await sendSave({
          ...chartToSave,
          version: data.currentVersion,
          updatedAt: data.currentUpdatedAt,
        });
        data = (await response.json()) as typeof data;
      }
      if (!response.ok || !data.chart) {
        throw new Error(data.error ?? "Chart details could not be saved.");
      }
      setCharts((current) =>
        current.map((candidate) => candidate.id === data.chart!.id ? data.chart! : candidate),
      );
      setNotice(`${data.chart.name} details were updated.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Chart details could not be saved.");
    }
  };

  const editChartDetails = (chart: ChartDocument) => {
    setEditorDialog({
      kind: "edit-chart",
      chartId: chart.id,
      name: chart.name,
      description: chart.description,
    });
  };

  const submitEditorDialog = (form: HTMLFormElement) => {
    if (!editorDialog) return;
    const formData = new FormData(form);
    const name = String(formData.get("dialogName") ?? "").trim();
    if (!name) {
      setNotice("A name is required.");
      return;
    }

    const dialog = editorDialog;
    setEditorDialog(null);
    if (dialog.kind === "create-chart") {
      void createChart(name);
      return;
    }
    if (dialog.kind === "add-child") {
      addChildUnit(name);
      return;
    }

    const chart = charts.find((candidate) => candidate.id === dialog.chartId);
    if (!chart) {
      setNotice("The chart details could not be opened.");
      return;
    }
    void updateChartMetadata(chart, {
      name,
      description: String(formData.get("dialogDescription") ?? "").trim(),
    });
  };

  const deleteChart = async (chart: ChartDocument) => {
    const confirmed = window.confirm(
      `Delete “${chart.name}”, its saved versions, and its stored source files? This cannot be undone.`,
    );
    if (!confirmed) return;
    if (chart.id === activeChartId) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveGenerationRef.current += 1;
    }
    const response = await fetch("/api/charts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", chartId: chart.id }),
    });
    if (!response.ok) {
      setNotice("The chart could not be deleted.");
      return;
    }
    const remaining = charts.filter((candidate) => candidate.id !== chart.id);
    setCharts(remaining);
    if (activeChartId === chart.id) {
      if (remaining[0]) {
        openChart(remaining[0], "library");
      } else {
        hydratedChartRef.current = null;
        setNodes([]);
        setEdges([]);
        setSelectedId("");
        setWorkspaceView("library");
      }
    }
    setNotice(`${chart.name}, its saved versions, and its stored source files were deleted.`);
  };

  const importFormData = (validateOnly: boolean) => {
    const formData = new FormData();
    if (importFile) formData.set("file", importFile);
    importEvidenceFiles.forEach((file) => formData.append("evidence", file));
    formData.set("chartName", importName.trim());
    if (validateOnly) formData.set("validateOnly", "1");
    return formData;
  };

  const validateImport = async () => {
    if (!importFile || !importName.trim()) {
      setNotice("Choose a CSV, JSON, or Excel file and provide a chart name.");
      return;
    }
    setImportBusy(true);
    setImportFindings([]);
    setImportPreview(null);
    setImportReviewed(false);
    try {
      const response = await fetch("/api/charts", {
        method: "POST",
        body: importFormData(true),
      });
      const data = (await response.json()) as {
        preview?: ImportPreview;
        error?: string;
        findings?: ValidationFinding[];
      };
      setImportFindings(data.preview?.findings ?? data.findings ?? []);
      if (!response.ok || !data.preview) {
        setNotice(data.error ?? "The import could not be validated.");
        return;
      }
      setImportPreview(data.preview);
      setNotice(
        `${data.preview.rowCount} units passed structural validation. Review the preview before creating the draft.`,
      );
    } catch {
      setNotice("The import could not be validated. No chart was created.");
    } finally {
      setImportBusy(false);
    }
  };

  const importChart = async () => {
    if (!importFile || !importName.trim() || !importPreview || !importReviewed) {
      setNotice("Validate the files and confirm the normalized hierarchy before importing.");
      return;
    }
    setImportBusy(true);
    try {
      const response = await fetch("/api/charts", {
        method: "POST",
        body: importFormData(false),
      });
      const data = (await response.json()) as {
        chart?: ChartDocument;
        error?: string;
        findings?: ValidationFinding[];
      };
      setImportFindings(data.findings ?? []);
      if (!response.ok || !data.chart) {
        setNotice(data.error ?? "The import could not be completed.");
        return;
      }
      setCharts((current) => [data.chart!, ...current]);
      setImportName("");
      setImportFile(null);
      setImportEvidenceFiles([]);
      setImportPreview(null);
      setImportReviewed(false);
      setNotice(
        `${data.chart.name} was imported as a draft with ${data.chart.sources.length} immutable source record${data.chart.sources.length === 1 ? "" : "s"}.`,
      );
      openChart(data.chart, "sources");
    } catch {
      setNotice("The import could not be completed. No partial chart was created.");
    } finally {
      setImportBusy(false);
    }
  };

  const downloadTextFile = (contents: string, fileName: string, type: string) => {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadSourceManifest = () => {
    if (!activeChart) return;
    const manifest = {
      chartId: activeChart.id,
      chartName: activeChart.name,
      version: activeChart.version,
      status: activeChart.status,
      generatedAt: new Date().toISOString(),
      sourceRecords: activeChart.sources.map((source) => ({
        id: source.id,
        chartId: source.chartId,
        fileName: source.fileName,
        contentType: source.contentType,
        fileSize: source.fileSize,
        checksum: source.checksum,
        sourceType: source.sourceType,
        importedAt: source.importedAt,
        rowCount: source.rowCount,
        warningCount: source.warningCount,
      })),
      canonicalData: {
        units: nodes.map((flowNode) => flowNode.data.unit),
        relationships: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.data?.relationshipType ?? "primary supervisory",
        })),
      },
    };
    downloadTextFile(
      JSON.stringify(manifest, null, 2),
      `${activeChart.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-source-manifest.json`,
      "application/json",
    );
    setNotice("Source manifest downloaded from the active draft chart.");
  };

  const chooseDesktopDataDirectory = async () => {
    if (!window.orgChartDesktop) return;
    setStorageBusy("data");
    setStorageMessage("");
    try {
      const settings = await window.orgChartDesktop.chooseDataDirectory();
      setDesktopStorage(settings);
      if (settings.restartRequired) {
        setStorageMessage(
          "The new live data folder is scheduled. Restart to copy and checksum-verify the data before the app switches folders.",
        );
      }
    } catch (error) {
      setStorageMessage(
        error instanceof Error ? error.message : "The live data folder could not be changed.",
      );
    } finally {
      setStorageBusy(null);
    }
  };

  const chooseDesktopBackupDirectory = async () => {
    if (!window.orgChartDesktop) return;
    setStorageBusy("backup");
    setStorageMessage("");
    try {
      const settings = await window.orgChartDesktop.chooseBackupDirectory();
      setDesktopStorage(settings);
      if (settings.backupDirectory) {
        setStorageMessage(
          settings.backupIsCloudSynced
            ? "Backup folder set. Only passphrase-encrypted .orgchart-backup files are written to this cloud-sync location."
            : "Backup folder set. Encrypted backups will be saved directly to this separate location.",
        );
      }
    } catch (error) {
      setStorageMessage(
        error instanceof Error ? error.message : "The backup folder could not be changed.",
      );
    } finally {
      setStorageBusy(null);
    }
  };

  const restartForStorageChange = async () => {
    if (!window.orgChartDesktop) return;
    setStorageBusy("restart");
    setStorageMessage("Restarting to verify and switch the live data folder…");
    try {
      const restarting = await window.orgChartDesktop.restartForStorageChange();
      if (!restarting) {
        setStorageMessage("No live data folder change is waiting for restart.");
        setStorageBusy(null);
      }
    } catch (error) {
      setStorageMessage(
        error instanceof Error ? error.message : "The desktop app could not restart.",
      );
      setStorageBusy(null);
    }
  };

  const exportEncryptedBackup = async () => {
    setBackupMessage("");
    if (backupPassphrase.length < 12) {
      setBackupMessage("Use a passphrase containing at least 12 characters.");
      return;
    }
    if (backupPassphrase !== backupPassphraseConfirm) {
      setBackupMessage("The backup passphrases do not match.");
      return;
    }

    setBackupBusy("export");
    try {
      const response = await fetch("/api/backups", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const data = (await response.json()) as LibraryBackup & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The backup could not be prepared.");
      const encrypted = await encryptLibraryBackup(data, backupPassphrase);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `orgchart-studio-backup-${stamp}.orgchart-backup`;
      const serialized = JSON.stringify(encrypted);
      const desktopBridge = window.orgChartDesktop;
      const savedBackup =
        desktopBridge && desktopStorage?.backupDirectory
          ? await desktopBridge.saveEncryptedBackup(fileName, serialized)
          : null;
      if (!savedBackup) {
        downloadTextFile(serialized, fileName, "application/json");
      }
      setBackupPassphrase("");
      setBackupPassphraseConfirm("");
      setBackupMessage(
        `Encrypted backup created with ${data.chartCount} charts, ${data.versionCount ?? 0} saved versions, and ${data.sourceFileCount} stored source files.${savedBackup ? ` Saved to ${savedBackup.path}.` : " Downloaded through the browser."}`,
      );
      setNotice(
        savedBackup
          ? "Encrypted library backup saved to the configured backup folder. Store its passphrase separately."
          : "Encrypted library backup downloaded. Store its passphrase separately.",
      );
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "The backup could not be created.");
    } finally {
      setBackupBusy(null);
    }
  };

  const restoreEncryptedBackup = async () => {
    setBackupMessage("");
    if (!backupFile || !restorePassphrase) {
      setBackupMessage("Choose an encrypted backup and enter its passphrase.");
      return;
    }
    if (backupFile.size > 38_000_000) {
      setBackupMessage("The encrypted backup exceeds the 38 MB prototype upload limit.");
      return;
    }

    setBackupBusy("restore");
    try {
      const envelope = JSON.parse(await backupFile.text()) as unknown;
      const decrypted = await decryptLibraryBackup(envelope, restorePassphrase);
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decrypted),
      });
      const result = (await response.json()) as {
        restoredChartCount?: number;
        restoredSourceFileCount?: number;
        restoredVersionCount?: number;
        restoredCharts?: ChartDocument[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "The backup could not be restored.");

      const libraryResponse = await fetch("/api/charts", { cache: "no-store" });
      const library = (await libraryResponse.json()) as ChartLibraryResponse;
      setCharts(library.charts);
      const firstRestoredId = result.restoredCharts?.[0]?.id;
      const firstRestored = library.charts.find((chart) => chart.id === firstRestoredId);
      if (firstRestored) openChart(firstRestored, "library");
      setBackupFile(null);
      setRestorePassphrase("");
      setBackupMessage(
        `Restore merged ${result.restoredChartCount ?? 0} charts, ${result.restoredVersionCount ?? 0} saved versions, and ${result.restoredSourceFileCount ?? 0} source files as new drafts.`,
      );
      setNotice("Encrypted backup restored by merge. Existing charts were not changed or deleted.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "The backup could not be restored.");
    } finally {
      setBackupBusy(null);
    }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const svgToPng = async (
    svg: string,
    width: number,
    height: number,
    requestedScale: 1 | 2 | 4,
  ): Promise<Blob> => {
    const maximumDimension = 16_000;
    const maximumPixels = 70_000_000;
    const scale = Math.min(
      requestedScale,
      maximumDimension / width,
      maximumDimension / height,
      Math.sqrt(maximumPixels / (width * height)),
    );
    const outputWidth = Math.max(1, Math.floor(width * scale));
    const outputHeight = Math.max(1, Math.floor(height * scale));
    const imageUrl = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
    try {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PNG canvas could not be initialized.");
      context.drawImage(image, 0, 0, outputWidth, outputHeight);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("PNG encoding failed."))),
          "image/png",
        );
      });
      return blob;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const exportChart = async (format: ExportFormat) => {
    if (!activeChart || exportBusy) return;
    if (blockingFindings.length) {
      setNotice("Resolve blocking structural findings before exporting this chart.");
      return;
    }
    setExportBusy(format);
    try {
      const scene = buildChartExportScene(
        { ...activeChart, nodes, edges },
        effectiveExportAudience,
        undefined,
        connectorRoutingMode,
      );
      const viewport = resolveExportViewport(scene, exportPreset);
      const fileStem = `${safeExportFileStem(activeChart.name)}-v${activeChart.version}-${effectiveExportAudience}-${exportPreset}`;
      if (format === "svg") {
        downloadBlob(
          new Blob([buildChartSvg(scene, exportPreset)], { type: "image/svg+xml;charset=utf-8" }),
          `${fileStem}.svg`,
        );
      } else if (format === "png") {
        const blob = await svgToPng(
          buildChartSvg(scene, exportPreset),
          viewport.width,
          viewport.height,
          pngScale,
        );
        downloadBlob(blob, `${fileStem}@${pngScale}x.png`);
      } else if (format === "pdf") {
        const { buildChartPdf } = await import("../lib/chart-export-pdf");
        const bytes = await buildChartPdf(scene, exportPreset);
        downloadBlob(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
          `${fileStem}.pdf`,
        );
      } else {
        const { buildChartPptx } = await import("../lib/chart-export-pptx");
        const bytes = await buildChartPptx(scene, exportPreset);
        downloadBlob(
          new Blob([bytes.slice().buffer as ArrayBuffer], {
            type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          }),
          `${fileStem}.pptx`,
        );
      }
      setNotice(
        `${format.toUpperCase()} exported from version ${activeChart.version} using the ${effectiveExportAudience} audience and ${EXPORT_PRESETS.find((preset) => preset.id === exportPreset)?.label ?? exportPreset} profile.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The chart export could not be created.");
    } finally {
      setExportBusy(null);
    }
  };

  const exportAccessibleTable = () => {
    if (!activeChart) return;
    if (blockingFindings.length) {
      setNotice("Resolve blocking structural findings before exporting this chart.");
      return;
    }
    const fileStem = `${safeExportFileStem(activeChart.name)}-v${activeChart.version}-${effectiveExportAudience}`;
    downloadTextFile(
      buildAccessibleTableCsv(
        { ...activeChart, nodes, edges },
        effectiveExportAudience,
      ),
      `${fileStem}-accessible-table.csv`,
      "text/csv;charset=utf-8",
    );
    setNotice(
      `Accessible CSV table exported from version ${activeChart.version} using the ${effectiveExportAudience} audience profile.`,
    );
  };

  return (
    <div className="studio-shell">
      <header className="topbar">
        <div className="product-mark" aria-label="ORNL OrgChart Studio">
          <span className="product-mark__tile" aria-hidden="true">
            <TreeStructure size={22} weight="bold" />
          </span>
          <span>
            <strong>OrgChart Studio</strong>
            <small>ORNL working prototype</small>
          </span>
        </div>

        <label className="global-search">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <span className="sr-only">Search units, positions, and assignments</span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Search units, positions, or assignments"
            disabled={!activeChart}
          />
          <kbd>/</kbd>
        </label>

        <div className="topbar__status">
          <label className="chart-switcher">
            <span className="sr-only">Active organizational chart</span>
            <select
              value={activeChart?.id ?? ""}
              onChange={(event) => {
                const chart = charts.find((candidate) => candidate.id === event.target.value);
                if (chart) openChart(chart);
              }}
              disabled={libraryLoading || !charts.length}
            >
              {!charts.length ? <option value="">No charts yet</option> : null}
              {charts.map((chart) => (
                <option key={chart.id} value={chart.id}>{chart.name}</option>
              ))}
            </select>
          </label>
          <span className="version-chip">{version}</span>
          <span className={`save-status save-status--${saveState}`}>
            {saveState === "saving" ? "Saving" : saveState === "error" ? "Save issue" : "Saved"}
          </span>
          <span className="validation-status">
            {!activeChart ? (
              <FolderOpen size={16} aria-hidden="true" />
            ) : blockingFindings.length ? (
              <WarningDiamond size={16} aria-hidden="true" />
            ) : (
              <ShieldCheck size={16} aria-hidden="true" />
            )}
            {!activeChart
              ? "No chart loaded"
              : blockingFindings.length
              ? `${blockingFindings.length} blocking`
              : "Structure valid"}
          </span>
        </div>
      </header>

      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar__section">
          <p className="sidebar__label">Workspace</p>
          <button
            type="button"
            className={workspaceView === "library" ? "is-active" : ""}
            onClick={() => setWorkspaceView("library")}
          >
            <FolderOpen size={19} aria-hidden="true" />
            <span>Chart library</span>
            <span className="nav-count nav-count--neutral">{charts.length}</span>
          </button>
          <button
            type="button"
            className={workspaceView === "canvas" ? "is-active" : ""}
            onClick={() => setWorkspaceView("canvas")}
            disabled={!activeChart}
          >
            <SquaresFour size={19} aria-hidden="true" />
            <span>Chart editor</span>
          </button>
          <button
            type="button"
            className={workspaceView === "table" ? "is-active" : ""}
            onClick={() => setWorkspaceView("table")}
            disabled={!activeChart}
          >
            <Table size={19} aria-hidden="true" />
            <span>Accessible table</span>
          </button>
          <button
            type="button"
            className={workspaceView === "sources" ? "is-active" : ""}
            onClick={() => setWorkspaceView("sources")}
          >
            <FileArrowUp size={19} aria-hidden="true" />
            <span>Sources & imports</span>
          </button>
          <button
            type="button"
            className={workspaceView === "exports" ? "is-active" : ""}
            onClick={() => setWorkspaceView("exports")}
            disabled={!activeChart}
          >
            <DownloadSimple size={19} aria-hidden="true" />
            <span>Publish & export</span>
          </button>
        </div>

        <div className="sidebar__section">
          <p className="sidebar__label">Change governance</p>
          <button
            type="button"
            className={workspaceView === "history" ? "is-active" : ""}
            onClick={showVersionHistory}
            disabled={!activeChart}
          >
            <ClockCounterClockwise size={19} aria-hidden="true" />
            <span>Version history</span>
            <span className="nav-count nav-count--neutral">
              {versions.length || activeChart?.version || 0}
            </span>
          </button>
        </div>

        <div className="sidebar__summary">
          <p>Active draft</p>
          <strong>{activeChart?.name ?? (libraryLoading ? "Loading" : "No chart selected")}</strong>
          <span>{charts.length} charts managed</span>
          <span>{nodes.length} units</span>
          <span>{edges.length} primary relationships</span>
        </div>
      </aside>

      <main className="workspace">
        <section className="prototype-notice" aria-live="polite">
          <span><Sparkle size={16} aria-hidden="true" /> Technical prototype</span>
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">
            <X size={16} aria-hidden="true" />
          </button>
        </section>

        {workspaceView === "canvas" ? (
          <section className="canvas-panel" aria-label="Interactive organizational chart">
            <div className="canvas-toolbar">
              <div className="layout-control">
                <label htmlFor="layout-mode">Layout mode</label>
                <select
                  id="layout-mode"
                  value={layoutMode}
                  onChange={(event) => setLayoutMode(event.target.value as LayoutMode)}
                >
                  <option value="preserve">Preserve layout</option>
                  <option value="branch">Selected branch</option>
                  <option value="respect-pins">Respect pins</option>
                  <option value="full">Full layout</option>
                </select>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void runLayout()}
                  disabled={isLayoutRunning}
                >
                  <ArrowsOut size={17} aria-hidden="true" />
                  {isLayoutRunning ? "Laying out…" : "Run layout"}
                </button>
                <label htmlFor="connector-routing-mode">Connectors</label>
                <select
                  id="connector-routing-mode"
                  value={connectorRoutingMode}
                  onChange={(event) =>
                    changeConnectorRoutingMode(
                      event.target.value as ConnectorRoutingMode,
                    )
                  }
                  title="Choose whether same-parent relationships may share a comb or always remain separate"
                >
                  <option value="separate">Separate lanes</option>
                  <option value="combed">Sibling combs</option>
                </select>
                <button
                  type="button"
                  className="button button--branch-toggle"
                  aria-pressed={moveBranchOnDrag}
                  onClick={() => setMoveBranchOnDrag((current) => !current)}
                  title={
                    moveBranchOnDrag
                      ? "Dragging a card moves and pins every card below it"
                      : "Dragging moves and pins only the selected card"
                  }
                >
                  <TreeStructure size={17} aria-hidden="true" />
                  Move branch: {moveBranchOnDrag ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  className="button button--selection-toggle"
                  aria-pressed={marqueeSelectionEnabled}
                  onClick={() => {
                    setMarqueeSelectionEnabled((current) => {
                      const next = !current;
                      setNotice(
                        next
                          ? "Area selection enabled. Drag across the canvas to select every card the box touches; hold Space to pan."
                          : "Area selection disabled. Dragging the canvas pans again; selected cards remain grouped until you click away.",
                      );
                      return next;
                    });
                  }}
                  title={
                    marqueeSelectionEnabled
                      ? "Turn off area selection and restore drag-to-pan"
                      : "Drag a rectangle across the canvas to select multiple cards"
                  }
                >
                  <Selection size={17} aria-hidden="true" />
                  Select area: {marqueeSelectionEnabled ? "On" : "Off"}
                </button>
              </div>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="button button--secondary button--history"
                  onClick={undoChange}
                  disabled={!undoStack.length}
                  title="Undo organizational or presentation change"
                >
                  <ArrowCounterClockwise size={17} aria-hidden="true" />
                  Undo
                </button>
                <button
                  type="button"
                  className="button button--secondary button--history"
                  onClick={redoChange}
                  disabled={!redoStack.length}
                  title="Redo organizational or presentation change"
                >
                  <ArrowClockwise size={17} aria-hidden="true" />
                  Redo
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    void fitView({ duration: 420, padding: 0.14 });
                  }}
                >
                  <ArrowsOut size={17} aria-hidden="true" />
                  Fit view
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setWorkspaceView("exports")}
                >
                  <DownloadSimple size={17} aria-hidden="true" />
                  Publish & export
                </button>
              </div>
            </div>

            {selectedCardCount > 1 ? (
              <div
                className="selection-arrange-toolbar"
                role="toolbar"
                aria-label={`Arrange ${selectedCardCount} selected cards`}
              >
                <span className="selection-arrange-toolbar__count">
                  <Selection size={16} aria-hidden="true" />
                  {selectedCardCount} selected
                </span>
                <div
                  className="selection-arrange-toolbar__group"
                  role="group"
                  aria-label="Horizontal alignment"
                >
                  <button
                    type="button"
                    onClick={() => arrangeSelection("align-left")}
                    aria-label="Align selected cards left"
                    title="Align left"
                  >
                    <AlignLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => arrangeSelection("align-horizontal-center")}
                    aria-label="Center selected cards horizontally"
                    title="Center horizontally"
                  >
                    <AlignCenterHorizontal size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => arrangeSelection("align-right")}
                    aria-label="Align selected cards right"
                    title="Align right"
                  >
                    <AlignRight size={18} aria-hidden="true" />
                  </button>
                </div>
                <div
                  className="selection-arrange-toolbar__group"
                  role="group"
                  aria-label="Vertical alignment"
                >
                  <button
                    type="button"
                    onClick={() => arrangeSelection("align-top")}
                    aria-label="Align selected cards to the top"
                    title="Align top"
                  >
                    <AlignTop size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => arrangeSelection("align-vertical-center")}
                    aria-label="Center selected cards vertically"
                    title="Center vertically"
                  >
                    <AlignCenterVertical size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => arrangeSelection("align-bottom")}
                    aria-label="Align selected cards to the bottom"
                    title="Align bottom"
                  >
                    <AlignBottom size={18} aria-hidden="true" />
                  </button>
                </div>
                <div
                  className="selection-arrange-toolbar__group"
                  role="group"
                  aria-label="Distribution"
                >
                  <button
                    type="button"
                    onClick={() => arrangeSelection("distribute-horizontal")}
                    disabled={selectedCardCount < 3}
                    aria-label="Distribute selected cards horizontally"
                    title="Distribute horizontally (three or more cards)"
                  >
                    <Columns size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => arrangeSelection("distribute-vertical")}
                    disabled={selectedCardCount < 3}
                    aria-label="Distribute selected cards vertically"
                    title="Distribute vertically (three or more cards)"
                  >
                    <Rows size={18} aria-hidden="true" />
                  </button>
                </div>
                <span className="selection-arrange-toolbar__hint">
                  Alignment moves selected cards only
                </span>
              </div>
            ) : null}

            <div
              className={`flow-surface ${marqueeSelectionEnabled ? "is-marquee-active" : ""}`}
            >
              <p id="canvas-selection-help" className="sr-only">
                {marqueeSelectionEnabled
                  ? "Area selection is on. Drag on empty canvas to draw a selection rectangle. Cards touched by the rectangle become a movable group. Control-click or Command-click adds individual cards. Hold Space while dragging to pan."
                  : "Area selection is off. Control-click or Command-click adds individual cards to a selection. Turn on Select area to draw a selection rectangle around multiple cards."}
              </p>
              <ReactFlow<OrgFlowNode>
                nodes={displayNodes}
                edges={displayEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                onSelectionChange={({ nodes: selectedNodes }) => {
                  if (!selectedNodes.length) return;
                  setSelectedId((current) =>
                    selectedNodes.some((candidate) => candidate.id === current)
                      ? current
                      : selectedNodes[0].id,
                  );
                }}
                onNodeDragStart={(_event, flowNode, draggedNodes) => {
                  const selectedNodeIds = new Set(
                    draggedNodes.map((candidate) => candidate.id),
                  );
                  const movesSelectedGroup = selectedNodeIds.size > 1;
                  if (movesSelectedGroup) {
                    const movementNodeIds = selectionMovementIds(
                      selectedNodeIds,
                      edges,
                      moveBranchOnDrag,
                    );
                    const movedDescendantCount =
                      movementNodeIds.size - selectedNodeIds.size;
                    dragStartSnapshotRef.current = editorSnapshot(
                      nodes,
                      edges,
                      selectedId,
                      movedDescendantCount > 0
                        ? `moving and pinning ${selectedNodeIds.size} selected branches`
                        : `moving and pinning ${selectedNodeIds.size} selected cards`,
                    );
                    groupDragRef.current = {
                      rootId: flowNode.id,
                      selectedNodeIds,
                      movementNodeIds,
                      startingPositions: new Map(
                        nodes
                          .filter((candidate) => movementNodeIds.has(candidate.id))
                          .map((candidate) => [
                            candidate.id,
                            candidate.id === flowNode.id
                              ? { ...flowNode.position }
                              : { ...candidate.position },
                          ]),
                      ),
                    };
                    branchDragRef.current = null;
                    return;
                  }

                  groupDragRef.current = null;
                  const branchIds = moveBranchOnDrag
                    ? descendantIds(flowNode.id, edges)
                    : new Set([flowNode.id]);
                  dragStartSnapshotRef.current = editorSnapshot(
                    nodes,
                    edges,
                    selectedId,
                    branchIds.size > 1
                      ? `moving and pinning the ${flowNode.data.unit.shortName} branch`
                      : "moving and pinning a card",
                  );
                  branchDragRef.current = moveBranchOnDrag
                    ? {
                        rootId: flowNode.id,
                        branchIds,
                        startingPositions: new Map(
                          nodes
                            .filter((candidate) => branchIds.has(candidate.id))
                            .map((candidate) => [
                              candidate.id,
                              candidate.id === flowNode.id
                                ? { ...flowNode.position }
                                : { ...candidate.position },
                            ]),
                        ),
                      }
                    : null;
                }}
                onNodeDrag={(_event, flowNode) => {
                  if (groupDragRef.current) positionDraggedGroup(flowNode);
                  else positionDraggedBranch(flowNode);
                }}
                onNodeDragStop={(_event, flowNode) => {
                  const movedGroup = groupDragRef.current;
                  if (movedGroup) positionDraggedGroup(flowNode);
                  else positionDraggedBranch(flowNode);
                  if (dragStartSnapshotRef.current) {
                    pushUndoSnapshot(dragStartSnapshotRef.current);
                    dragStartSnapshotRef.current = null;
                  }
                  const movedBranchIds = movedGroup
                    ? undefined
                    : branchDragRef.current?.branchIds;
                  const movedDescendantCount = Math.max(
                    0,
                    (movedBranchIds?.size ?? 1) - 1,
                  );
                  const pinnedNodeIds =
                    movedGroup?.movementNodeIds ??
                    movedBranchIds ??
                    new Set([flowNode.id]);
                  setNodes((currentNodes) =>
                    currentNodes.map((candidate) =>
                      pinnedNodeIds.has(candidate.id)
                        ? {
                            ...candidate,
                            position:
                              candidate.id === flowNode.id
                                ? flowNode.position
                                : candidate.position,
                            data: { ...candidate.data, pinned: true },
                          }
                        : candidate,
                    ),
                  );
                  branchDragRef.current = null;
                  groupDragRef.current = null;
                  setSelectedId(flowNode.id);
                  setNotice(
                    movedGroup
                      ? `${movedGroup.selectedNodeIds.size} selected cards${movedGroup.movementNodeIds.size > movedGroup.selectedNodeIds.size ? ` and ${movedGroup.movementNodeIds.size - movedGroup.selectedNodeIds.size} cards below them` : ""} were moved together and pinned. Reporting lines did not change.`
                      : movedDescendantCount > 0
                      ? `${flowNode.data.unit.shortName} and ${movedDescendantCount} ${movedDescendantCount === 1 ? "card below it were" : "cards below it were"} moved together and pinned. Reporting lines did not change.`
                      : `${flowNode.data.unit.shortName} was moved and pinned. Its semantic parent did not change.`,
                  );
                }}
                fitView
                fitViewOptions={{ padding: 0.14 }}
                minZoom={0.22}
                maxZoom={1.6}
                nodesConnectable={false}
                deleteKeyCode={null}
                selectionKeyCode={null}
                selectionOnDrag={marqueeSelectionEnabled}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode={["Control", "Meta"]}
                panOnDrag={!marqueeSelectionEnabled}
                aria-describedby="canvas-selection-help"
                defaultEdgeOptions={{
                  type: "orgRelationship",
                  style: { stroke: "#00454d", strokeWidth: 1.5 },
                }}
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  color="#dbdcdb"
                  gap={22}
                  size={1}
                />
                <Controls showInteractive={false} />
                <MiniMap
                  nodeColor={(flowNode) => {
                    const typedNode = flowNode as OrgFlowNode;
                    if (typedNode.data.unit.type === "laboratory") return "#00662c";
                    if (typedNode.data.unit.type === "directorate") return "#00454d";
                    return "#dbdcdb";
                  }}
                  maskColor="rgba(0, 69, 77, 0.08)"
                  pannable
                  zoomable
                />
              </ReactFlow>
            </div>

            <div className="canvas-legend" aria-label="Chart legend">
              <span><i className="legend-dot legend-dot--filled" />Filled</span>
              <span><i className="legend-dot legend-dot--acting" />Acting</span>
              <span><i className="legend-dot legend-dot--vacant" />Vacant</span>
              <span><MapPin size={14} weight="fill" aria-hidden="true" /> Dragging pins presentation only</span>
              <span>
                <Selection size={14} aria-hidden="true" />
                {selectedCardCount > 1
                  ? `${selectedCardCount} cards move together`
                  : marqueeSelectionEnabled
                    ? "Drag a box to select cards; Space pans"
                    : "Control/Command-click or Select area groups cards"}
              </span>
              <span>
                <TreeStructure size={14} aria-hidden="true" />
                {connectorRoutingMode === "combed"
                  ? "Sibling combs share only within one branch"
                  : "Every connector uses a separate lane"}
              </span>
            </div>
          </section>
        ) : workspaceView === "table" ? (
          <section className="table-panel" aria-labelledby="table-title">
            <div className="table-panel__heading">
              <div>
                <span className="eyebrow">Parallel accessible output</span>
                <h1 id="table-title">Organizational hierarchy table</h1>
                <p>Generated from the same current chart data as the visual editor.</p>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setWorkspaceView("canvas")}
              >
                <SquaresFour size={17} aria-hidden="true" />
                Return to chart
              </button>
            </div>
            <div className="data-table-wrap">
              <table>
                <caption className="sr-only">
                  {activeChart?.name ?? "Current chart"} organizational units, semantic parents,
                  positions, assignments, and statuses
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Unit</th>
                    <th scope="col">Type</th>
                    <th scope="col">Semantic parent</th>
                    <th scope="col">Position</th>
                    <th scope="col">Assignment</th>
                    <th scope="col">Status</th>
                    <th scope="col">Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((flowNode) => {
                    const parentEdge = edges.find((edge) => edge.target === flowNode.id);
                    const parent = nodes.find((candidate) => candidate.id === parentEdge?.source);
                    return (
                      <tr key={flowNode.id}>
                        <th scope="row">
                          <button type="button" onClick={() => focusNode(flowNode.id)}>
                            {flowNode.data.unit.name}
                          </button>
                        </th>
                        <td>{flowNode.data.unit.type}</td>
                        <td>{parent?.data.unit.shortName ?? "Root"}</td>
                        <td>{flowNode.data.unit.positionTitle}</td>
                        <td>{flowNode.data.unit.assignmentLabel}</td>
                        <td>
                          <span className={`table-status status--${flowNode.data.unit.positionStatus}`}>
                            <i className="status-marker" aria-hidden="true" />
                            {statusLabels[flowNode.data.unit.positionStatus]}
                          </span>
                        </td>
                        <td>{flowNode.data.unit.effectiveDate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : workspaceView === "library" ? (
          <section className="library-panel" aria-labelledby="library-title">
            <div className="library-heading">
              <div>
                <span className="eyebrow">Governed chart portfolio</span>
                <h1 id="library-title">Organizational chart library</h1>
                <p>Manage each chart as a separate versioned data document with its own sources and layout.</p>
              </div>
              <div className="library-heading__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setWorkspaceView("sources")}
                >
                  <FileArrowUp size={17} aria-hidden="true" />
                  Import chart
                </button>
                <button type="button" className="button button--primary" onClick={requestCreateChart}>
                  <Plus size={17} weight="bold" aria-hidden="true" />
                  New chart
                </button>
              </div>
            </div>

            <div className="library-metrics" aria-label="Chart library summary">
              <div><span>Total charts</span><strong>{charts.length}</strong></div>
              <div><span>Drafts</span><strong>{charts.filter((chart) => chart.status === "draft").length}</strong></div>
              <div><span>Source records</span><strong>{charts.reduce((count, chart) => count + chart.sources.length, 0)}</strong></div>
              <div><span>Storage</span><strong>{libraryLoading ? "Loading" : "Persistent"}</strong></div>
            </div>

            {libraryLoading ? (
              <div className="library-empty" role="status">Loading chart library…</div>
            ) : charts.length ? (
              <div className="chart-card-grid">
                {charts.map((chart) => (
                  <article
                    key={chart.id}
                    className={`chart-card ${chart.id === activeChartId ? "is-active" : ""}`}
                  >
                    <div className="chart-card__top">
                      <label className="chart-status-control">
                        <span className="sr-only">Working status for {chart.name}</span>
                        <select
                          value={chart.status}
                          onChange={(event) =>
                            void updateChartMetadata(chart, {
                              status: event.target.value as ChartDocument["status"],
                            })
                          }
                          aria-label={`Working status for ${chart.name}`}
                        >
                          <option value="draft">Draft</option>
                          <option value="in_review">In review</option>
                          {chart.status === "approved" ? (
                            <option value="approved">Approved record</option>
                          ) : null}
                          <option value="archived">Archived</option>
                        </select>
                      </label>
                      <span>v{chart.version}</span>
                    </div>
                    <h2>{chart.name}</h2>
                    <p>{chart.description}</p>
                    <dl>
                      <div><dt>Units</dt><dd>{chart.nodes.length}</dd></div>
                      <div><dt>Relationships</dt><dd>{chart.edges.length}</dd></div>
                      <div><dt>Sources</dt><dd>{chart.sources.length}</dd></div>
                    </dl>
                    <div className="chart-card__updated">
                      Updated {new Date(chart.updatedAt).toLocaleDateString()}
                    </div>
                    <div className="chart-card__actions">
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => openChart(chart)}
                      >
                        <FolderOpen size={16} aria-hidden="true" />Open
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => editChartDetails(chart)}
                        aria-label={`Edit name and description for ${chart.name}`}
                        title="Edit chart name and description"
                      >
                        <PencilSimple size={17} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => void duplicateChart(chart)}
                        aria-label={`Duplicate ${chart.name}`}
                        title="Duplicate chart"
                      >
                        <Copy size={17} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        onClick={() => void deleteChart(chart)}
                        aria-label={`Delete ${chart.name}`}
                        title="Delete chart and stored sources"
                      >
                        <Trash size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="library-empty">
                <FolderOpen size={30} aria-hidden="true" />
                <h2>No organizational charts yet</h2>
                <p>Create a blank chart or import a structured source file.</p>
              </div>
            )}
          </section>
        ) : workspaceView === "exports" ? (
          <section className="export-panel" aria-labelledby="export-title">
            <div className="export-heading">
              <div>
                <span className="eyebrow">Versioned publication output</span>
                <h1 id="export-title">Publish and export</h1>
                <p>
                  Choose the intended audience, then create every format from the same
                  chart data, layout, and version metadata.
                </p>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setWorkspaceView("canvas")}
              >
                <SquaresFour size={17} aria-hidden="true" />Return to editor
              </button>
            </div>

            <div className="export-summary">
              <div>
                <span>Active chart</span>
                <strong>{activeChart?.name ?? "No chart selected"}</strong>
              </div>
              <div><span>Saved version</span><strong>v{activeChart?.version ?? 0}</strong></div>
              <div><span>All units</span><strong>{nodes.length}</strong></div>
              <div><span>Public units</span><strong>{publicUnitCount}</strong></div>
            </div>

            <fieldset className="audience-profiles">
              <legend>Audience profile</legend>
              <label className={effectiveExportAudience === "internal" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="export-audience"
                  value="internal"
                  checked={effectiveExportAudience === "internal"}
                  onChange={() => setExportAudience("internal")}
                />
                <ShieldCheck size={22} aria-hidden="true" />
                <span>
                  <strong>Internal working draft</strong>
                  <small>Includes every unit and the current assignment labels.</small>
                </span>
                <b>{nodes.length} units</b>
              </label>
              <label className={effectiveExportAudience === "public" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="export-audience"
                  value="public"
                  checked={effectiveExportAudience === "public"}
                  onChange={() => setExportAudience("public")}
                  disabled={!publicUnitCount}
                />
                <ShieldWarning size={22} aria-hidden="true" />
                <span>
                  <strong>Public-safe draft</strong>
                  <small>
                    Includes only public-marked units and replaces assignment labels with
                    position status.
                  </small>
                </span>
                <b>{publicUnitCount} units</b>
              </label>
            </fieldset>

            <fieldset className="output-presets">
              <legend>Output profile</legend>
              <div>
                {EXPORT_PRESETS.map((preset) => (
                  <label
                    key={preset.id}
                    className={exportPreset === preset.id ? "is-selected" : ""}
                  >
                    <input
                      type="radio"
                      name="export-preset"
                      value={preset.id}
                      checked={exportPreset === preset.id}
                      onChange={() => setExportPreset(preset.id)}
                    />
                    <span>
                      <strong>{preset.label}</strong>
                      <small>{preset.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {exportProfileError ? (
              <div className="publication-warning publication-warning--blocking" role="alert">
                <WarningDiamond size={20} aria-hidden="true" />
                <p><strong>Audience profile needs attention.</strong> {exportProfileError}</p>
              </div>
            ) : null}

            {exportPreset !== "natural" && exportCardWidth > 0 && exportCardWidth < 110 ? (
              <div className="publication-warning" role="status">
                <WarningDiamond size={20} aria-hidden="true" />
                <p>
                  <strong>Small-card warning.</strong> Fitting the whole hierarchy to this
                  profile reduces cards to about {Math.round(exportCardWidth)} pixels wide.
                  Visual exports preserve the editor&apos;s card and text proportions, so use
                  natural bounds, a larger profile, or export a smaller branch for readable
                  detail.
                </p>
              </div>
            ) : null}

            {effectiveExportAudience === "public" ? (
              <div className="publication-warning" role="status">
                <ShieldWarning size={20} aria-hidden="true" />
                <p>
                  <strong>Approval still required.</strong> This filter is a technical aid,
                  not a publication clearance. {nodes.length - publicUnitCount} unit
                  {nodes.length - publicUnitCount === 1 ? " is" : "s are"} excluded.
                </p>
              </div>
            ) : null}

            <div className="export-format-grid">
              <article>
                <DownloadSimple size={26} aria-hidden="true" />
                <div><span>Scalable vector</span><h2>SVG</h2><p>Best for web, design tools, and lossless resizing.</p></div>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void exportChart("svg")}
                  disabled={exportBusy !== null || blockingFindings.length > 0 || Boolean(exportProfileError)}
                >
                  {exportBusy === "svg" ? "Creating…" : "Download SVG"}
                </button>
              </article>
              <article>
                <DownloadSimple size={26} aria-hidden="true" />
                <div><span>High-resolution image</span><h2>PNG</h2><p>Convenient for email, documents, and previews.</p></div>
                <div className="export-format-actions">
                  <label aria-label="PNG resolution scale">
                    <select
                      value={pngScale}
                      onChange={(event) => setPngScale(Number(event.target.value) as 1 | 2 | 4)}
                      aria-label="PNG resolution scale"
                    >
                      <option value={1}>1× web</option>
                      <option value={2}>2× standard</option>
                      <option value={4}>4× high-res</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void exportChart("png")}
                    disabled={exportBusy !== null || blockingFindings.length > 0 || Boolean(exportProfileError)}
                  >
                    {exportBusy === "png" ? "Creating…" : "Download PNG"}
                  </button>
                </div>
              </article>
              <article>
                <FilePdf size={26} aria-hidden="true" />
                <div><span>Vector document</span><h2>PDF</h2><p>Preserves searchable text and chart metadata.</p></div>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void exportChart("pdf")}
                  disabled={exportBusy !== null || blockingFindings.length > 0 || Boolean(exportProfileError)}
                >
                  {exportBusy === "pdf" ? "Creating…" : "Download PDF"}
                </button>
              </article>
              <article>
                <FilePpt size={26} aria-hidden="true" />
                <div><span>Editable presentation</span><h2>PowerPoint</h2><p>Matches editor proportions; each card, connector, and text block remains editable.</p></div>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void exportChart("pptx")}
                  disabled={exportBusy !== null || blockingFindings.length > 0 || Boolean(exportProfileError)}
                >
                  {exportBusy === "pptx" ? "Creating…" : "Download PPTX"}
                </button>
              </article>
              <article>
                <Table size={26} aria-hidden="true" />
                <div><span>Parallel accessible output</span><h2>CSV table</h2><p>Provides the same hierarchy as a structured, screen-reader-friendly table.</p></div>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={exportAccessibleTable}
                  disabled={exportBusy !== null || blockingFindings.length > 0 || Boolean(exportProfileError)}
                >
                  Download table
                </button>
              </article>
            </div>

            {blockingFindings.length ? (
              <div className="publication-warning publication-warning--blocking" role="alert">
                <WarningDiamond size={20} aria-hidden="true" />
                <p><strong>Export paused.</strong> Resolve the blocking hierarchy findings in the editor first.</p>
              </div>
            ) : null}
          </section>
        ) : workspaceView === "history" ? (
          <section className="history-panel" aria-labelledby="history-title">
            <div className="history-heading">
              <div>
                <span className="eyebrow">Immutable working checkpoints</span>
                <h1 id="history-title">Version and change history</h1>
                <p>
                  Save a named checkpoint, compare it with the working draft, or restore it
                  as a new version without deleting history.
                </p>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => activeChart && void loadVersions(activeChart.id)}
                disabled={!activeChart || historyBusy !== null}
              >
                <ArrowClockwise size={17} aria-hidden="true" /> Refresh history
              </button>
            </div>

            <div className="version-save-card">
              <div>
                <span className="eyebrow">Current working draft</span>
                <h2>{activeChart?.name ?? "No active chart"}</h2>
                <p>
                  Autosave protects the open draft. A named version creates an immutable
                  comparison and recovery point.
                </p>
              </div>
              <label className="editor-field">
                <span>Change summary</span>
                <input
                  value={versionSummary}
                  maxLength={160}
                  onChange={(event) => setVersionSummary(event.target.value)}
                  placeholder="Example: Updated division leadership and reporting lines"
                />
              </label>
              <button
                type="button"
                className="button button--primary"
                onClick={() => void saveVersionSnapshot()}
                disabled={historyBusy !== null || !activeChart || blockingFindings.length > 0}
              >
                <FloppyDisk size={17} aria-hidden="true" />
                {historyBusy === "save" ? "Saving version…" : "Save named version"}
              </button>
            </div>

            {historyBusy === "load" && !versions.length ? (
              <div className="history-empty" role="status">Loading saved versions…</div>
            ) : versions.length ? (
              <div className="history-layout">
                <div className="version-list" aria-label="Saved chart versions">
                  {versions.map((versionItem) => (
                    <article
                      key={versionItem.id}
                      className={
                        versionItem.id === compareVersionId
                          ? "version-card is-selected"
                          : "version-card"
                      }
                    >
                      <label>
                        <input
                          type="radio"
                          name="compare-version"
                          checked={versionItem.id === compareVersionId}
                          onChange={() => setCompareVersionId(versionItem.id)}
                        />
                        <span>
                          <strong>Version {versionItem.version}</strong>
                          <small>{new Date(versionItem.createdAt).toLocaleString()}</small>
                        </span>
                      </label>
                      <p>{versionItem.label}</p>
                      {versionItem.restoredFromVersion ? (
                        <span className="version-origin">
                          Restored from v{versionItem.restoredFromVersion}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => void restoreSavedVersion(versionItem)}
                        disabled={historyBusy !== null}
                      >
                        <ClockCounterClockwise size={16} aria-hidden="true" />
                        Restore as new version
                      </button>
                    </article>
                  ))}
                </div>

                <div className="version-comparison" aria-live="polite">
                  {compareVersion && versionComparison ? (
                    <>
                      <span className="eyebrow">Working draft compared with saved version</span>
                      <h2>Current draft vs. version {compareVersion.version}</h2>
                      <p>{compareVersion.label}</p>
                      <div className="comparison-metrics">
                        <div><span>Added</span><strong>{versionComparison.added.length}</strong></div>
                        <div><span>Changed</span><strong>{versionComparison.changed.length}</strong></div>
                        <div><span>Removed</span><strong>{versionComparison.removed.length}</strong></div>
                      </div>
                      <ul>
                        {[
                          ...versionComparison.added.map((flowNode) => ({
                            id: `added-${flowNode.id}`,
                            type: "Added",
                            name: flowNode.data.unit.shortName,
                          })),
                          ...versionComparison.changed.map((flowNode) => ({
                            id: `changed-${flowNode.id}`,
                            type: "Changed",
                            name: flowNode.data.unit.shortName,
                          })),
                          ...versionComparison.removed.map((flowNode) => ({
                            id: `removed-${flowNode.id}`,
                            type: "Removed",
                            name: flowNode.data.unit.shortName,
                          })),
                        ].slice(0, 20).map((item) => (
                          <li key={item.id}>
                            <span>{item.type}</span><strong>{item.name}</strong>
                          </li>
                        ))}
                      </ul>
                      {!versionComparison.added.length &&
                      !versionComparison.changed.length &&
                      !versionComparison.removed.length ? (
                        <div className="comparison-empty">
                          The working draft matches this saved version.
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="comparison-empty">
                      Select a saved version to compare it with the working draft.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="history-empty">
                No saved versions are available for this chart yet.
              </div>
            )}
          </section>
        ) : (
          <section className="sources-panel" aria-labelledby="sources-title">
            <div className="sources-heading">
              <div>
                <span className="eyebrow">Source-controlled intake</span>
                <h1 id="sources-title">Sources and imports</h1>
                <p>Preserve the original, normalize its data, validate the hierarchy, and keep the mapping reviewable.</p>
              </div>
              <div className="sources-heading__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() =>
                    downloadTextFile(
                      aiIntakeBrief(),
                      "orgchart-studio-ai-normalization-brief.md",
                      "text/markdown",
                    )
                  }
                >
                  <Robot size={17} aria-hidden="true" />AI normalization brief
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() =>
                    downloadTextFile(importTemplateCsv(), "orgchart-import-template.csv", "text/csv")
                  }
                >
                  <DownloadSimple size={17} aria-hidden="true" />CSV template
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={downloadSourceManifest}
                  disabled={!activeChart}
                >
                  <DownloadSimple size={17} aria-hidden="true" />Source manifest
                </button>
              </div>
            </div>

            <div className="sources-layout">
              <div className="import-card">
                <div className="import-card__heading">
                  <FileArrowUp size={24} aria-hidden="true" />
                  <div><h2>Import a structured chart</h2><p>Creates a new draft chart; it does not overwrite the active chart.</p></div>
                </div>
                <label className="field-stack">
                  <span>Chart name</span>
                  <input
                    type="text"
                    value={importName}
                    onChange={(event) => {
                      setImportName(event.target.value);
                      setImportPreview(null);
                      setImportReviewed(false);
                    }}
                    placeholder="Example Directorate — Current"
                  />
                </label>
                <label className="file-drop">
                  <FileCsv size={30} aria-hidden="true" />
                  <strong>{importFile?.name ?? "Choose normalized CSV, staff roster, JSON, or Excel data"}</strong>
                  <span>Maximum 5 MB · roster CSVs map Full Name to Supervisor Full Name · original stored with SHA-256 checksum</span>
                  <input
                    key={importFile?.name ?? "empty-file"}
                    type="file"
                    accept=".csv,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => {
                      setImportFile(event.target.files?.[0] ?? null);
                      setImportPreview(null);
                      setImportReviewed(false);
                    }}
                  />
                </label>
                <label className="evidence-picker">
                  <FilePpt size={22} aria-hidden="true" />
                  <span>
                    <strong>
                      {importEvidenceFiles.length
                        ? `${importEvidenceFiles.length} reference file${importEvidenceFiles.length === 1 ? "" : "s"} selected`
                        : "Attach original PowerPoint, Word, PDF, or image references (optional)"}
                    </strong>
                    <small>
                      {importEvidenceFiles.length
                        ? importEvidenceFiles.map((file) => file.name).join(" · ")
                        : "Up to 10 files · 20 MB each · 25 MB combined intake · retained beside the structured data"}
                    </small>
                  </span>
                  <input
                    key={importEvidenceFiles.map((file) => file.name).join("|") || "empty-evidence"}
                    type="file"
                    multiple
                    accept=".pptx,.docx,.pdf,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
                    onChange={(event) => {
                      setImportEvidenceFiles(Array.from(event.target.files ?? []).slice(0, 10));
                      setImportPreview(null);
                      setImportReviewed(false);
                    }}
                  />
                </label>
                <div className="import-actions">
                  <span>Required: name and one hierarchy root. Staff rosters and Excel files can generate stable IDs and map common columns.</span>
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={importBusy || !importFile || !importName.trim()}
                    onClick={() => void validateImport()}
                  >
                    <FileArrowUp size={17} aria-hidden="true" />
                    {importBusy ? "Validating…" : "Validate for review"}
                  </button>
                </div>

                {importFindings.length ? (
                  <div className="import-findings" aria-live="polite">
                    <h3>Validation findings</h3>
                    <ul>
                      {importFindings.map((finding, index) => (
                        <li key={`${finding.code}-${index}`} className={`finding--${finding.severity}`}>
                          <WarningDiamond size={16} aria-hidden="true" />
                          <span><strong>{finding.code}</strong>{finding.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {importPreview ? (
                  <div className="import-review" aria-live="polite">
                    <div className="import-review__heading">
                      <div>
                        <span className="eyebrow">Human confirmation required</span>
                        <h3>Review normalized hierarchy</h3>
                        <p>
                          {importPreview.rowCount} units and {importPreview.edges.length} primary relationships will create a new draft.
                        </p>
                      </div>
                      <ShieldCheck size={24} aria-hidden="true" />
                    </div>
                    <div className="import-review__table">
                      <table>
                        <thead>
                          <tr><th scope="col">Unit</th><th scope="col">Parent</th><th scope="col">Status</th></tr>
                        </thead>
                        <tbody>
                          {importPreview.nodes.slice(0, 16).map((flowNode) => {
                            const parentEdge = importPreview.edges.find(
                              (edge) => edge.target === flowNode.id,
                            );
                            const parent = importPreview.nodes.find(
                              (candidate) => candidate.id === parentEdge?.source,
                            );
                            return (
                              <tr key={flowNode.id}>
                                <th scope="row">{flowNode.data.unit.name}</th>
                                <td>{parent?.data.unit.shortName ?? "Root"}</td>
                                <td>{statusLabels[flowNode.data.unit.positionStatus]}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {importPreview.nodes.length > 16 ? (
                      <p className="import-review__remainder">
                        {importPreview.nodes.length - 16} additional units passed the same validation.
                      </p>
                    ) : null}
                    <label className="review-confirmation">
                      <input
                        type="checkbox"
                        checked={importReviewed}
                        onChange={(event) => setImportReviewed(event.target.checked)}
                      />
                      <span>I reviewed the unit names, primary parents, statuses, and attached source evidence.</span>
                    </label>
                    <button
                      type="button"
                      className="button button--primary button--full"
                      disabled={importBusy || !importReviewed}
                      onClick={() => void importChart()}
                    >
                      <Check size={17} aria-hidden="true" />
                      {importBusy ? "Creating draft…" : "Confirm and create draft chart"}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="source-methods">
                <h2>Existing-chart intake path</h2>
                <p>Different source formats need different confidence and review controls.</p>
                <article className="source-method source-method--ready">
                  <FileCsv size={24} aria-hidden="true" />
                  <div><span>Direct structured import</span><h3>Canonical CSV, staff roster, or JSON</h3><p>Map unit fields or staff supervisors, validate the hierarchy, then create a draft.</p></div>
                  <strong>Ready</strong>
                </article>
                <article className="source-method source-method--ready">
                  <Table size={24} aria-hidden="true" />
                  <div><span>Mapped structured import</span><h3>Excel workbook</h3><p>Reads the first worksheet, maps common headers, generates missing stable IDs, and validates the hierarchy.</p></div>
                  <strong>Ready</strong>
                </article>
                <article className="source-method source-method--ready">
                  <FilePpt size={24} aria-hidden="true" />
                  <div><span>Mixed-source evidence set</span><h3>PowerPoint and Word</h3><p>Attach several original references beside one reviewed roster, CSV, Excel file, or canonical JSON import.</p></div>
                  <strong>Ready</strong>
                </article>
                <article className="source-method source-method--ready">
                  <FilePdf size={24} aria-hidden="true" />
                  <div><span>AI-assisted guided extraction</span><h3>PDF or image</h3><p>Normalize only in an approved AI environment, validate the JSON, and require human confirmation before import.</p></div>
                  <strong>Ready</strong>
                </article>
              </div>
            </div>

            <section className="backup-card" aria-labelledby="backup-title">
              <div className="backup-card__heading">
                <FileLock size={26} aria-hidden="true" />
                <div>
                  <span className="eyebrow">Portable recovery copy</span>
                  <h2 id="backup-title">Encrypted library backup</h2>
                  <p>Includes every chart, saved version, source record, layout, and available original imported file.</p>
                </div>
              </div>

              <div className="storage-locations" aria-labelledby="storage-locations-title">
                <div className="storage-locations__heading">
                  <div>
                    <HardDrives size={22} aria-hidden="true" />
                    <div>
                      <span className="eyebrow">Desktop file locations</span>
                      <h3 id="storage-locations-title">Separate live data from recovery copies</h3>
                    </div>
                  </div>
                  <span className="storage-badge">
                    {storageMode === "desktop" ? "Desktop controls active" : "Desktop app only"}
                  </span>
                </div>

                {desktopStorage ? (
                  <div className="storage-location-grid">
                    <article className="storage-location">
                      <div className="storage-location__label">
                        <HardDrives size={18} aria-hidden="true" />
                        <div><span>Live chart library</span><strong>Local only</strong></div>
                      </div>
                      <code title={desktopStorage.dataDirectory}>{desktopStorage.dataDirectory}</code>
                      <p>Contains the working database and imported source files. Cloud-sync and repository folders are blocked.</p>
                      {desktopStorage.pendingDataDirectory ? (
                        <div className="storage-location__pending">
                          Pending after restart: <code>{desktopStorage.pendingDataDirectory}</code>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={storageBusy !== null}
                        onClick={() => void chooseDesktopDataDirectory()}
                      >
                        <FolderOpen size={17} aria-hidden="true" />
                        {storageBusy === "data" ? "Choosing folder…" : "Choose empty local folder"}
                      </button>
                    </article>

                    <article className="storage-location">
                      <div className="storage-location__label">
                        <CloudArrowUp size={18} aria-hidden="true" />
                        <div>
                          <span>Encrypted backups</span>
                          <strong>
                            {desktopStorage.backupIsCloudSynced ? "Cloud-sync allowed" : "Separate folder"}
                          </strong>
                        </div>
                      </div>
                      <code title={desktopStorage.backupDirectory ?? undefined}>
                        {desktopStorage.backupDirectory ?? "No backup folder selected"}
                      </code>
                      <p>May be in OneDrive or Dropbox. The app writes only encrypted .orgchart-backup packages here.</p>
                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={storageBusy !== null}
                        onClick={() => void chooseDesktopBackupDirectory()}
                      >
                        <FolderOpen size={17} aria-hidden="true" />
                        {storageBusy === "backup" ? "Choosing folder…" : "Choose backup folder"}
                      </button>
                    </article>
                  </div>
                ) : (
                  <p className="storage-locations__browser-note">
                    {storageMode === "loading"
                      ? "Checking desktop storage controls…"
                      : "Open the installed Electron app to choose protected live-data and backup folders. This browser session continues to use its configured development storage."}
                  </p>
                )}

                {desktopStorage?.restartRequired ? (
                  <div className="storage-restart">
                    <div>
                      <strong>Restart required to switch live data folders</strong>
                      <span>The app will copy, checksum-verify, and switch only after verification succeeds. The old folder remains as a recovery copy.</span>
                    </div>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={storageBusy !== null}
                      onClick={() => void restartForStorageChange()}
                    >
                      <ArrowClockwise size={17} aria-hidden="true" />
                      {storageBusy === "restart" ? "Restarting…" : "Restart and move safely"}
                    </button>
                  </div>
                ) : null}

                {storageMessage ? (
                  <div className="storage-message" role="status">{storageMessage}</div>
                ) : null}
              </div>

              <div className="security-boundary">
                <ShieldWarning size={20} aria-hidden="true" />
                <p><strong>Prototype boundary:</strong> authentication and production access controls are not connected. Use only synthetic or approved sanitized data. A backup passphrase cannot be recovered by the application.</p>
              </div>

              <div className="backup-actions-grid">
                <div className="backup-action">
                  <div><span>01</span><h3>Create encrypted backup</h3></div>
                  <p>Encryption happens in this browser with AES-256-GCM. The passphrase is never stored.</p>
                  <label className="field-stack">
                    <span>Backup passphrase</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={backupPassphrase}
                      onChange={(event) => setBackupPassphrase(event.target.value)}
                      placeholder="At least 12 characters"
                    />
                  </label>
                  <label className="field-stack">
                    <span>Confirm passphrase</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={backupPassphraseConfirm}
                      onChange={(event) => setBackupPassphraseConfirm(event.target.value)}
                      placeholder="Enter it again"
                    />
                  </label>
                  <button
                    type="button"
                    className="button button--primary button--full"
                    disabled={backupBusy !== null}
                    onClick={() => void exportEncryptedBackup()}
                  >
                    <FileLock size={17} aria-hidden="true" />
                    {backupBusy === "export"
                      ? "Encrypting backup…"
                      : desktopStorage?.backupDirectory
                        ? "Encrypt and save to backup folder"
                        : "Encrypt and download"}
                  </button>
                </div>

                <div className="backup-action">
                  <div><span>02</span><h3>Restore without overwriting</h3></div>
                  <p>Restore is merge-only. Every recovered chart receives a new ID and returns as a draft.</p>
                  <label className="backup-file-picker">
                    <UploadSimple size={22} aria-hidden="true" />
                    <span>{backupFile?.name ?? "Choose encrypted backup"}</span>
                    <input
                      key={backupFile?.name ?? "empty-backup"}
                      type="file"
                      accept=".orgchart-backup,application/json"
                      onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label className="field-stack">
                    <span>Backup passphrase</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={restorePassphrase}
                      onChange={(event) => setRestorePassphrase(event.target.value)}
                      placeholder="Passphrase used at export"
                    />
                  </label>
                  <button
                    type="button"
                    className="button button--secondary button--full"
                    disabled={backupBusy !== null || !backupFile}
                    onClick={() => void restoreEncryptedBackup()}
                  >
                    <UploadSimple size={17} aria-hidden="true" />
                    {backupBusy === "restore" ? "Validating restore…" : "Decrypt and restore copies"}
                  </button>
                </div>
              </div>

              {backupMessage ? <div className="backup-message" role="status">{backupMessage}</div> : null}
            </section>

            <div className="source-register">
              <div className="source-register__heading">
                <div><span className="eyebrow">Active chart</span><h2>{activeChart?.name ?? "No active chart"}</h2></div>
                <span>{activeChart?.sources.length ?? 0} source records</span>
              </div>
              {activeChart?.sources.length ? (
                <div className="data-table-wrap">
                  <table>
                    <caption className="sr-only">Stored source files and provenance for the active chart</caption>
                    <thead><tr><th scope="col">Source</th><th scope="col">Type</th><th scope="col">Rows</th><th scope="col">Imported</th><th scope="col">Checksum</th><th scope="col">File</th></tr></thead>
                    <tbody>
                      {activeChart.sources.map((source) => (
                        <tr key={source.id}>
                          <th scope="row">{source.fileName}</th>
                          <td>{source.sourceType.replace("_", " ")}</td>
                          <td>{source.rowCount}</td>
                          <td>{new Date(source.importedAt).toLocaleDateString()}</td>
                          <td><code>{source.checksum.length > 18 ? `${source.checksum.slice(0, 18)}…` : source.checksum}</code></td>
                          <td>
                            {source.storageKey ? (
                              <a
                                className="source-download"
                                href={`/api/charts?resource=source&sourceId=${encodeURIComponent(source.id)}`}
                                download={source.fileName}
                              >
                                <DownloadSimple size={15} aria-hidden="true" />Download
                              </a>
                            ) : (
                              <span className="source-unavailable">Built in</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="source-register__empty">
                  <Archive size={24} aria-hidden="true" />No source records are attached to this draft.
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <aside className="detail-panel" aria-label="Selected unit details">
        {selectedNode ? (
          <>
            <div className="detail-panel__heading">
              <span className="eyebrow">Selected {selectedNode.data.unit.type}</span>
              <h2>{selectedNode.data.unit.shortName}</h2>
              <p>{selectedNode.data.unit.name}</p>
            </div>

            <div className="detail-panel__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={requestAddChildUnit}
              >
                <Plus size={16} aria-hidden="true" /> Add child
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={deleteSelectedBranch}
                disabled={!selectedParentEdge}
                title={
                  selectedParentEdge
                    ? "Delete this unit and its descendants"
                    : "The chart root is managed from the chart library"
                }
              >
                <Trash size={16} aria-hidden="true" /> Delete
              </button>
            </div>

            <form
              key={`${selectedNode.id}-${JSON.stringify(selectedNode.data.unit)}-${selectedParentEdge?.source ?? "root"}`}
              className="unit-editor"
              onSubmit={(event) => {
                event.preventDefault();
                saveUnitChanges(event.currentTarget);
              }}
            >
              <div className="unit-editor__identity">
                <span>Stable unit ID</span>
                <code>{selectedNode.id}</code>
              </div>

              <label className="editor-field">
                <span>Full unit name</span>
                <input
                  name="name"
                  required
                  defaultValue={selectedNode.data.unit.name}
                />
              </label>
              <label className="editor-field">
                <span>Card display name</span>
                <input
                  name="shortName"
                  required
                  defaultValue={selectedNode.data.unit.shortName}
                />
              </label>
              <div className="editor-field-row">
                <label className="editor-field">
                  <span>Unit type</span>
                  <select
                    name="type"
                    defaultValue={selectedNode.data.unit.type}
                  >
                    <option value="laboratory">Laboratory</option>
                    <option value="directorate">Directorate</option>
                    <option value="division">Division</option>
                    <option value="section">Section</option>
                    <option value="group">Group</option>
                    <option value="team">Team</option>
                    <option value="program">Program</option>
                    <option value="office">Office</option>
                    <option value="project">Project organization</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="editor-field">
                  <span>Position status</span>
                  <select
                    name="positionStatus"
                    defaultValue={selectedNode.data.unit.positionStatus}
                  >
                    <option value="filled">Filled</option>
                    <option value="acting">Acting</option>
                    <option value="vacant">Vacant</option>
                  </select>
                </label>
              </div>
              <label className="editor-field">
                <span>Primary parent</span>
                <select
                  name="parentId"
                  defaultValue={selectedParentEdge?.source ?? ""}
                  disabled={!selectedParentEdge}
                >
                  {!selectedParentEdge ? (
                    <option value="">Organization root</option>
                  ) : null}
                  {eligibleParents.map((flowNode) => (
                    <option key={flowNode.id} value={flowNode.id}>
                      {flowNode.data.unit.shortName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="editor-field">
                <span>Position title</span>
                <input
                  name="positionTitle"
                  required
                  defaultValue={selectedNode.data.unit.positionTitle}
                />
              </label>
              <label className="editor-field">
                <span>Assignment or vacancy label</span>
                <input
                  name="assignmentLabel"
                  defaultValue={selectedNode.data.unit.assignmentLabel}
                />
              </label>
              <label className="editor-field">
                <span>Effective date or label</span>
                <input
                  name="effectiveDate"
                  defaultValue={selectedNode.data.unit.effectiveDate}
                />
              </label>
              <label className="editor-field">
                <span>Publication visibility</span>
                <select
                  name="publicationVisibility"
                  defaultValue={selectedNode.data.unit.publicationVisibility}
                >
                  <option value="internal">Internal</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label className="editor-field">
                <span>Source or provenance note</span>
                <input
                  name="source"
                  defaultValue={selectedNode.data.unit.source}
                />
              </label>

              <button type="submit" className="button button--primary button--full">
                <FloppyDisk size={17} aria-hidden="true" /> Save organizational changes
              </button>
            </form>

            <div className="presentation-state">
              <div>
                <span>Presentation state</span>
                <strong>{selectedNode.data.pinned ? "Pinned" : "Auto placed"}</strong>
              </div>
              <code>
                x {Math.round(selectedNode.position.x)} · y {Math.round(selectedNode.position.y)}
              </code>
              <p>Coordinates can change without changing the semantic parent.</p>
            </div>

            <button
              type="button"
              className="button button--full button--secondary"
              onClick={() => {
                recordCurrentState(
                  selectedNode.data.pinned
                    ? `unpinning ${selectedNode.data.unit.shortName}`
                    : `pinning ${selectedNode.data.unit.shortName}`,
                );
                setNodes((currentNodes) =>
                  currentNodes.map((flowNode) =>
                    flowNode.id === selectedNode.id
                      ? { ...flowNode, data: { ...flowNode.data, pinned: !flowNode.data.pinned } }
                      : flowNode,
                  ),
                );
              }}
            >
              <PushPin size={17} aria-hidden="true" />
              {selectedNode.data.pinned ? "Unpin card" : "Pin card position"}
            </button>
          </>
        ) : null}
      </aside>

      {editorDialog ? (
        <div className="editor-dialog-scrim">
          <section
            className="editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-dialog-title"
          >
            <div className="editor-dialog__heading">
              <div>
                <span className="eyebrow">
                  {editorDialog.kind === "edit-chart" ? "Chart details" : "Create draft"}
                </span>
                <h2 id="editor-dialog-title">
                  {editorDialog.kind === "create-chart"
                    ? "New organizational chart"
                    : editorDialog.kind === "add-child"
                      ? "Add a child unit"
                      : "Edit chart name and description"}
                </h2>
                <p>
                  {editorDialog.kind === "add-child"
                    ? `The new unit will report to ${editorDialog.parentName}.`
                    : editorDialog.kind === "create-chart"
                      ? "Start a separate versioned chart with one editable root unit."
                      : "These details identify the chart in the shared local library."}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditorDialog(null)}
                aria-label="Close dialog"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <form
              className="editor-dialog__form"
              onSubmit={(event) => {
                event.preventDefault();
                submitEditorDialog(event.currentTarget);
              }}
            >
              <label className="editor-field">
                <span>
                  {editorDialog.kind === "add-child" ? "Unit name" : "Chart name"}
                </span>
                <input
                  name="dialogName"
                  defaultValue={editorDialog.name}
                  maxLength={160}
                  required
                  autoFocus
                />
              </label>

              {editorDialog.kind === "edit-chart" ? (
                <label className="editor-field">
                  <span>Chart description</span>
                  <textarea
                    name="dialogDescription"
                    defaultValue={editorDialog.description}
                    rows={5}
                    maxLength={800}
                  />
                </label>
              ) : null}

              <div className="editor-dialog__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setEditorDialog(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="button button--primary">
                  {editorDialog.kind === "create-chart"
                    ? "Create chart"
                    : editorDialog.kind === "add-child"
                      ? "Add child unit"
                      : "Save chart details"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

    </div>
  );
}

export function OrgChartStudio() {
  return (
    <ReactFlowProvider>
      <StudioWorkspace />
    </ReactFlowProvider>
  );
}
