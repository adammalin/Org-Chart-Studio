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
import { CaretLeft } from "@phosphor-icons/react/CaretLeft";
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
import { Question } from "@phosphor-icons/react/Question";
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
  arrangeCompactPresentation,
  arrangeSelectedNodes,
  compactNodeDimensions,
  deriveCompactPresentation,
  descendantIds,
  positionBranchNodesFromSnapshot,
  runElkLayout,
  selectionMovementIds,
  validateHierarchy,
  type ChartPresentationMode,
  type CompactDisplay,
  type OrgFlowNode,
  type OrganizationalUnit,
  type PositionStatus,
  type PlanningState,
  type SelectionArrangement,
  type SourceCertainty,
  type UnitType,
  type ValidationFinding,
} from "../lib/org-chart";
import {
  auditChartQuality,
  compareChartDocuments,
  mergeSourceIntoTarget,
  planningStateForNode,
} from "../lib/chart-governance";
import {
  storageSafeNodes,
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
import {
  encryptLibraryBackup,
  openLibraryBackup,
  type BackupProtection,
} from "../lib/encrypted-backup";
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
  manualEdgeRouteForEdge,
  manualEdgeRouteFromRoute,
  moveManualEdgeRouteLane,
  sourcePortOffset,
  type ConnectorRoutingMode,
  type EdgeRoutePoint,
  type ManualEdgeRoute,
  type OrthogonalEdgeRoute,
  type RouteCornerAxis,
  type RouteCornerControl,
} from "../lib/edge-routing";
import {
  IDLE_MCP_ACTIVITY,
  type McpActivityResponse,
  type McpActivitySnapshot,
} from "../lib/mcp-activity";
import type {
  AiActivityHistoryResponse,
  AiActivityRecord,
  AiChangeCategory,
  AiChartProposal,
  AiPendingProposalSummary,
  AiPendingProposalsResponse,
  AiProposalResponse,
} from "../lib/ai-change-review";
import type {
  AiImportProposal,
  AiImportProposalResponse,
} from "../lib/ai-import-review";
import type { ImportIntake, ImportIntakesResponse } from "../lib/import-intake";
import type { McpControlResponse, McpControlState } from "../lib/mcp-control";

type LayoutMode = "preserve" | "branch" | "respect-pins" | "full";
type WorkspaceView =
  | "library"
  | "canvas"
  | "table"
  | "sources"
  | "backups"
  | "history"
  | "ai"
  | "exports";
type BackupScope = "all" | "selected";
type ExportFormat = "svg" | "png" | "pdf" | "pptx";
type PlanningFilter = "all" | PlanningState;

interface OnboardingTourStep {
  eyebrow: string;
  title: string;
  body: string;
  target: "navigation" | "presentation" | "chart-status" | "ai-control" | "tips" | null;
  placement: "center" | "right" | "bottom";
}

interface TourGeometry {
  target: { top: number; left: number; width: number; height: number } | null;
  panel: { top: number; left: number };
}

interface BackupHealthState {
  reminderDays: 7 | 14 | 30 | 90;
  lastBackupAt: string | null;
  lastBackupChartCount: number;
  lastBackupEncrypted: boolean;
  lastRestoreVerifiedAt: string | null;
}

const CONNECTOR_ROUTING_STORAGE_KEY = "orgchart-studio-connector-routing-mode";
const CONNECTOR_ROUTING_EVENT = "orgchart-studio-connector-routing-change";
const BACKUP_HEALTH_STORAGE_KEY = "orgchart-studio-backup-health";
const ONBOARDING_STORAGE_KEY = "orgchart-studio-onboarding-v1";
const PRESENTATION_STORAGE_KEY = "orgchart-studio-presentation-v1";

const ONBOARDING_TOUR_STEPS: OnboardingTourStep[] = [
  {
    eyebrow: "Welcome",
    title: "Know what is saved—and what still needs you",
    body:
      "This short tour shows where to open charts, check save state, review AI proposals, and return for help. You remain in control of every applied change.",
    target: null,
    placement: "center",
  },
  {
    eyebrow: "Step 1",
    title: "Move through the chart workflow",
    body:
      "Use the workspace navigation to open the chart library, edit the selected chart, review sources, make backups, export, and inspect version history.",
    target: "navigation",
    placement: "right",
  },
  {
    eyebrow: "Step 2",
    title: "Choose a grouped or individual presentation",
    body:
      "Compact groups keeps major units as cards and lists terminal lower-level assignments inside their parent group. Individual cards restores one card for every record. Switching views never removes chart data.",
    target: "presentation",
    placement: "bottom",
  },
  {
    eyebrow: "Step 3",
    title: "Check the working chart state",
    body:
      "The top bar identifies the active chart, version, validation result, and save state. “Not applied” means you are previewing an AI proposal—the saved chart is still unchanged.",
    target: "chart-status",
    placement: "bottom",
  },
  {
    eyebrow: "Step 4",
    title: "AI proposals always wait for your decision",
    body:
      "Open Local AI control to manage access and receipts. When a proposal arrives, compare Before and After, then apply it, reject it, or choose Review later. A pending banner keeps unsaved proposals easy to find.",
    target: "ai-control",
    placement: "right",
  },
  {
    eyebrow: "Step 5",
    title: "Replay these tips anytime",
    body:
      "Choose Tips & tour whenever you want this walkthrough again. Nothing in the tour edits, applies, publishes, or exports a chart.",
    target: "tips",
    placement: "right",
  },
];

const defaultBackupHealth: BackupHealthState = {
  reminderDays: 30,
  lastBackupAt: null,
  lastBackupChartCount: 0,
  lastBackupEncrypted: true,
  lastRestoreVerifiedAt: null,
};

function storedBackupHealth(): BackupHealthState {
  if (typeof window === "undefined") return defaultBackupHealth;
  try {
    const stored = window.localStorage.getItem(BACKUP_HEALTH_STORAGE_KEY);
    return stored
      ? { ...defaultBackupHealth, ...(JSON.parse(stored) as BackupHealthState) }
      : defaultBackupHealth;
  } catch {
    return defaultBackupHealth;
  }
}

function storedPresentationMode(): ChartPresentationMode {
  if (typeof window === "undefined") return "compact";
  return window.localStorage.getItem(PRESENTATION_STORAGE_KEY) === "individual"
    ? "individual"
    : "compact";
}

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

interface RouteCornerDragState {
  edgeId: string;
  pointIndex: number;
  allowedAxis: RouteCornerAxis;
  lockedAxis?: "x" | "y";
  startPointer: EdgeRoutePoint;
  startPoint: EdgeRoutePoint;
  manualRoute: ManualEdgeRoute;
  snapshot: EditorSnapshot;
  moved: boolean;
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
    data: edge.data
      ? {
          ...edge.data,
          manualRoute: manualEdgeRouteForEdge(edge),
        }
      : undefined,
  }));
}

function edgeWithManualRoute(
  edge: Edge,
  manualRoute?: ManualEdgeRoute,
): Edge {
  const data = { ...(edge.data ?? {}) };
  if (manualRoute) data.manualRoute = manualRoute;
  else delete data.manualRoute;
  return { ...edge, data };
}

interface RelationshipEdgeRenderData extends Record<string, unknown> {
  aiChange?: "added" | "changed";
  route?: OrthogonalEdgeRoute;
  onCornerDragStart?: (
    edgeId: string,
    route: OrthogonalEdgeRoute,
    control: RouteCornerControl,
    pointer: EdgeRoutePoint,
  ) => void;
  onCornerDrag?: (edgeId: string, pointer: EdgeRoutePoint) => void;
  onCornerDragEnd?: (edgeId: string) => void;
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
  const compactEntries = data.compactEntries ?? [];
  const sourceHandleCount = Math.max(0, data.sourcePortCount ?? data.childCount ?? 0);
  const targetSide = data.targetSide ?? "top";

  return (
    <article
      className={`org-node org-node--${unit.type} ${
        selected ? "is-selected" : ""
      } ${data.isSearchMatch ? "is-search-match" : ""} ${data.aiChange ? `is-ai-${data.aiChange}` : ""} ${unit.planningState === "planned" ? "is-planned" : ""} ${unit.sourceCertainty === "needs_review" ? "needs-source-review" : ""} ${data.presentationMode === "compact" ? `is-compact is-level-${data.hierarchyLevel ?? 1}` : ""} ${data.compactSidecar ? "is-compact-sidecar" : ""} ${compactEntries.length ? "has-compact-list" : ""}`}
      aria-label={`${unit.name}, ${unit.positionTitle}, ${statusLabels[unit.positionStatus]}`}
      style={{
        width: data.visualWidth,
        height: data.visualHeight,
      }}
    >
      {data.aiChange ? (
        <span className={`org-node__ai-change org-node__ai-change--${data.aiChange}`}>
          AI {data.aiChange}
        </span>
      ) : null}
      {unit.planningState === "planned" ? (
        <span className="org-node__planning-state">Planned</span>
      ) : null}
      {unit.sourceCertainty === "needs_review" ? (
        <span className="org-node__source-review">Needs review</span>
      ) : null}
      <Handle
        id="parent"
        type="target"
        position={targetSide === "left" ? Position.Left : Position.Top}
        isConnectable={false}
        style={
          targetSide === "left"
            ? { top: `calc(50% + ${data.targetPortOffset ?? 0}px)` }
            : { left: `calc(50% + ${data.targetPortOffset ?? 0}px)` }
        }
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
      {compactEntries.length ? (
        <div className="org-node__compact-roster">
          <div className="org-node__compact-roster-heading">
            <span>{compactEntries.length} listed assignment{compactEntries.length === 1 ? "" : "s"}</span>
            <small>Level 4+ shown in this group</small>
          </div>
          <ul>
            {compactEntries.map((entry) => (
              <li
                key={entry.id}
                className={`${entry.selected ? "is-selected" : ""} ${entry.isSearchMatch ? "is-search-match" : ""} ${entry.aiChange ? `is-ai-${entry.aiChange}` : ""}`}
              >
                <button
                  type="button"
                  className="nodrag"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onSelectCompactEntry?.(entry.id);
                  }}
                  aria-label={`Open ${entry.unit.name}`}
                >
                  <strong>{entry.unit.shortName || entry.unit.name}</strong>
                  <span>{entry.unit.positionTitle}</span>
                  <small className={`status--${entry.unit.positionStatus}`}>
                    <span className="status-marker" aria-hidden="true" />
                    {entry.unit.positionStatus === "filled"
                      ? entry.unit.assignmentLabel
                      : statusLabels[entry.unit.positionStatus]}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasChildren && data.presentationMode !== "compact" ? (
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
      {hasChildren ? (
        <Handle
          id="org-source"
          className="org-node__stable-source"
          type="source"
          position={Position.Bottom}
          isConnectable={false}
        />
      ) : null}
      {data.presentationMode === "individual" ? (
        Array.from({ length: sourceHandleCount }, (_, index) => (
          <Handle
            key={`route-${index}`}
            id={`route-${index}`}
            type="source"
            position={Position.Bottom}
            isConnectable={false}
            style={{
              left: `calc(50% + ${sourcePortOffset(index, sourceHandleCount, data.visualWidth ?? NODE_WIDTH)}px)`,
            }}
          />
        ))
      ) : null}
    </article>
  );
}

const nodeTypes = { orgUnit: OrgUnitNode };

function OrgRelationshipEdge({
  id,
  data,
  style,
  selected,
  markerStart,
  markerEnd,
  interactionWidth,
}: EdgeProps) {
  const renderData = data as RelationshipEdgeRenderData | undefined;
  const route = renderData?.route;
  const { screenToFlowPosition } = useReactFlow();
  if (!route) return null;
  const path = edgeRoutePath(route);

  const beginCornerDrag = (
    event: React.PointerEvent<SVGGElement>,
    control: RouteCornerControl,
  ) => {
    if (control.axis === "none") return;
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    renderData?.onCornerDragStart?.(id, route, control, pointer);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      renderData?.onCornerDrag?.(
        id,
        screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY }),
      );
    };
    const finishPointerDrag = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", finishPointerDrag);
      renderData?.onCornerDragEnd?.(id);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishPointerDrag);
    window.addEventListener("pointercancel", finishPointerDrag);
  };

  return (
    <>
      <path
        className={`org-relationship-edge__halo ${selected ? "is-selected" : ""} ${renderData?.aiChange ? `is-ai-${renderData.aiChange}` : ""}`}
        d={path}
      />
      <BaseEdge
        id={id}
        path={path}
        className={`org-relationship-edge ${selected ? "is-selected" : ""} ${renderData?.aiChange ? `is-ai-${renderData.aiChange}` : ""}`}
        style={{
          ...style,
          strokeLinecap: "square",
          strokeLinejoin: "miter",
        }}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
      />
      {selected
        ? route.controls.map((control) => (
            <g
              key={`${id}-corner-${control.pointIndex}`}
              className={`route-corner-control nodrag nopan ${
                control.pinned ? "is-pinned" : "is-automatic"
              } ${control.axis === "none" ? "is-locked" : ""}`}
              transform={`translate(${control.x} ${control.y})`}
              role="button"
              aria-label={`${control.pinned ? "Pinned" : "Automatic"} connector corner ${control.pointIndex + 1}`}
              tabIndex={0}
              onPointerDown={(event) => beginCornerDrag(event, control)}
            >
              <title>
                {control.axis === "none"
                  ? "This endpoint corner is locked"
                  : control.pinned
                    ? "Drag this pinned corner to move its lane"
                    : "Drag to pin and move this connector lane"}
              </title>
              <circle r="8" />
              <path d="M -3 -3 L 3 3 M 3 -3 L -3 3" />
            </g>
          ))
        : null}
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
  const [saveState, setSaveState] = useState<"saved" | "saving" | "proposal" | "error">("saved");
  const [selectedId, setSelectedId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [presentationMode, setPresentationMode] = useState<ChartPresentationMode>(
    storedPresentationMode,
  );
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
  const [importIntakes, setImportIntakes] = useState<ImportIntake[]>([]);
  const [importIntakeId, setImportIntakeId] = useState("");
  const [intakeName, setIntakeName] = useState("");
  const [intakeFiles, setIntakeFiles] = useState<File[]>([]);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [importFindings, setImportFindings] = useState<ValidationFinding[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importReviewed, setImportReviewed] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState("");
  const [backupProtection, setBackupProtection] = useState<BackupProtection>("encrypted");
  const [unencryptedBackupConfirmed, setUnencryptedBackupConfirmed] = useState(false);
  const [backupScope, setBackupScope] = useState<BackupScope>("all");
  const [backupSelectedChartIds, setBackupSelectedChartIds] = useState<Set<string>>(
    new Set(),
  );
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupBusy, setBackupBusy] = useState<"export" | "restore" | null>(null);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupHealth, setBackupHealth] = useState<BackupHealthState>(storedBackupHealth);
  const [backupClock, setBackupClock] = useState(0);
  const [desktopStorage, setDesktopStorage] = useState<DesktopStorageSettings | null>(null);
  const [storageMode, setStorageMode] = useState<"loading" | "desktop" | "browser">(
    "browser",
  );
  const [storageBusy, setStorageBusy] = useState<"data" | "backup" | "restart" | null>(
    null,
  );
  const [quitBusy, setQuitBusy] = useState(false);
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
  const [mcpActivity, setMcpActivity] = useState<McpActivitySnapshot>(
    IDLE_MCP_ACTIVITY,
  );
  const [dismissedMcpRevision, setDismissedMcpRevision] = useState(0);
  const [pendingAiProposal, setPendingAiProposal] = useState<AiChartProposal | null>(null);
  const [pendingAiProposalSummaries, setPendingAiProposalSummaries] = useState<
    AiPendingProposalSummary[]
  >([]);
  const [pendingAiImportProposal, setPendingAiImportProposal] =
    useState<AiImportProposal | null>(null);
  const [aiProposalBusy, setAiProposalBusy] = useState<"load" | "accept" | "reject" | null>(null);
  const [aiProposalError, setAiProposalError] = useState("");
  const [aiImportBusy, setAiImportBusy] = useState<"load" | "accept" | "reject" | null>(null);
  const [aiImportError, setAiImportError] = useState("");
  const [aiReviewCategory, setAiReviewCategory] = useState<"all" | AiChangeCategory>("all");
  const [aiActivities, setAiActivities] = useState<AiActivityRecord[]>([]);
  const [mcpControl, setMcpControl] = useState<McpControlState | null>(null);
  const [mcpControlBusy, setMcpControlBusy] = useState(false);
  const [comparisonSourceId, setComparisonSourceId] = useState("");
  const [comparisonTargetId, setComparisonTargetId] = useState("");
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [planningFilter, setPlanningFilter] = useState<PlanningFilter>("all");
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [tourGeometry, setTourGeometry] = useState<TourGeometry>({
    target: null,
    panel: { top: 0, left: 0 },
  });
  const hydratedChartRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGenerationRef = useRef(0);
  const chartsRef = useRef<ChartDocument[]>([]);
  const dragStartSnapshotRef = useRef<EditorSnapshot | null>(null);
  const branchDragRef = useRef<BranchDragState | null>(null);
  const groupDragRef = useRef<GroupDragState | null>(null);
  const routeCornerDragRef = useRef<RouteCornerDragState | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const onboardingDialogRef = useRef<HTMLElement | null>(null);
  const onboardingInitializedRef = useRef(false);
  const { fitView } = useReactFlow<OrgFlowNode>();

  const activeChart = charts.find((chart) => chart.id === activeChartId) ?? charts[0];
  const selectedBackupCharts = charts.filter((chart) =>
    backupSelectedChartIds.has(chart.id),
  );
  const backupAgeDays = backupHealth.lastBackupAt
    ? Math.max(
        0,
        Math.floor((backupClock - Date.parse(backupHealth.lastBackupAt)) / 86_400_000),
      )
    : null;
  const backupIsDue = backupAgeDays === null || backupAgeDays >= backupHealth.reminderDays;
  const unencryptedCloudBackupBlocked =
    backupProtection === "unencrypted" && Boolean(desktopStorage?.backupIsCloudSynced);
  const version = activeChart
    ? `${activeChart.status.replace("_", " ").replace(/^./, (character) => character.toUpperCase())} v${activeChart.version}`
    : libraryLoading
      ? "Loading library"
      : "No chart selected";

  useEffect(() => {
    chartsRef.current = charts;
  }, [charts]);

  const activeQualityReport = useMemo(
    () =>
      activeChart
        ? auditChartQuality(nodes, edges, charts, activeChart.id)
        : null,
    [activeChart, charts, edges, nodes],
  );
  const planningFilteredNodes = useMemo(
    () =>
      planningFilter === "all"
        ? nodes
        : nodes.filter((node) => planningStateForNode(node) === planningFilter),
    [nodes, planningFilter],
  );

  const effectiveComparisonTargetId = charts.some((chart) => chart.id === comparisonTargetId)
    ? comparisonTargetId
    : activeChart?.id ?? charts[0]?.id ?? "";
  const effectiveComparisonSourceId = charts.some((chart) => chart.id === comparisonSourceId)
    ? comparisonSourceId
    : charts.find((chart) => chart.id !== effectiveComparisonTargetId)?.id ?? "";
  const comparisonSource = charts.find((chart) => chart.id === effectiveComparisonSourceId);
  const comparisonTarget = charts.find((chart) => chart.id === effectiveComparisonTargetId);
  const chartComparison = useMemo(
    () =>
      comparisonSource && comparisonTarget && comparisonSource.id !== comparisonTarget.id
        ? compareChartDocuments(comparisonTarget, comparisonSource)
        : null,
    [comparisonSource, comparisonTarget],
  );

  const saveBackupHealth = useCallback((next: BackupHealthState) => {
    setBackupHealth(next);
    setBackupClock(Date.now());
    window.localStorage.setItem(BACKUP_HEALTH_STORAGE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    const updateClock = () => setBackupClock(Date.now());
    const initialTimer = window.setTimeout(updateClock, 0);
    const interval = window.setInterval(updateClock, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  const loadImportIntakes = useCallback(async () => {
    const response = await fetch("/api/import-intakes", { cache: "no-store" });
    if (!response.ok) throw new Error("Source intakes could not be loaded.");
    const data = (await response.json()) as ImportIntakesResponse;
    setImportIntakes(data.intakes);
  }, []);

  const loadMcpControl = useCallback(async () => {
    const response = await fetch("/api/mcp-control", { cache: "no-store" });
    if (!response.ok) throw new Error("Local AI controls could not be loaded.");
    const data = (await response.json()) as McpControlResponse;
    setMcpControl(data.control);
  }, []);

  const loadPendingAiProposals = useCallback(async () => {
    const response = await fetch("/api/ai-proposals?status=pending", { cache: "no-store" });
    if (!response.ok) throw new Error("Pending AI proposals could not be loaded.");
    const data = (await response.json()) as AiPendingProposalsResponse;
    setPendingAiProposalSummaries(data.proposals);
    return data.proposals;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadImportIntakes().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadImportIntakes]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const response = await fetch("/api/ai-proposals?status=pending", {
          cache: "no-store",
        });
        if (response.ok && !cancelled) {
          const data = (await response.json()) as AiPendingProposalsResponse;
          setPendingAiProposalSummaries(data.proposals);
        }
      } catch {
        // The persistent review banner recovers on the next successful local poll.
      }
      if (!cancelled) timer = setTimeout(poll, 1_500);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (libraryLoading || onboardingInitializedRef.current) return;
    onboardingInitializedRef.current = true;
    let completed = false;
    try {
      completed = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "complete";
    } catch {
      completed = false;
    }
    if (completed) return;
    const timer = window.setTimeout(() => setOnboardingStep(0), 500);
    return () => window.clearTimeout(timer);
  }, [libraryLoading]);

  useEffect(() => {
    if (onboardingStep === null) return;
    const step = ONBOARDING_TOUR_STEPS[onboardingStep];
    const updateGeometry = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelWidth = Math.min(390, viewportWidth - 32);
      const panelHeight = 300;
      const clamp = (value: number, minimum: number, maximum: number) =>
        Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
      const targetElement = step.target
        ? [...document.querySelectorAll<HTMLElement>(`[data-tour-target="${step.target}"]`)].find(
            (candidate) => {
              const candidateRect = candidate.getBoundingClientRect();
              return (
                candidateRect.width > 0 &&
                candidateRect.height > 0 &&
                candidateRect.right > 0 &&
                candidateRect.bottom > 0 &&
                candidateRect.left < viewportWidth &&
                candidateRect.top < viewportHeight
              );
            },
          )
        : null;
      const rect = targetElement?.getBoundingClientRect();
      const hasVisibleTarget = Boolean(rect && rect.width > 0 && rect.height > 0);
      if (!rect || !hasVisibleTarget || step.placement === "center") {
        setTourGeometry({
          target: null,
          panel: {
            top: Math.max(16, (viewportHeight - panelHeight) / 2),
            left: Math.max(16, (viewportWidth - panelWidth) / 2),
          },
        });
        return;
      }
      const padding = 8;
      const target = {
        top: Math.max(4, rect.top - padding),
        left: Math.max(4, rect.left - padding),
        width: Math.min(viewportWidth - 8, rect.width + padding * 2),
        height: Math.min(viewportHeight - 8, rect.height + padding * 2),
      };
      const fitsRight = rect.right + 18 + panelWidth <= viewportWidth - 16;
      const panelLeft =
        step.placement === "right" && fitsRight
          ? rect.right + 18
          : clamp(rect.left, 16, viewportWidth - panelWidth - 16);
      const panelTop =
        step.placement === "bottom" || !fitsRight
          ? clamp(rect.bottom + 18, 16, viewportHeight - panelHeight - 16)
          : clamp(rect.top, 16, viewportHeight - panelHeight - 16);
      setTourGeometry({ target, panel: { top: panelTop, left: panelLeft } });
    };
    updateGeometry();
    window.addEventListener("resize", updateGeometry);
    window.addEventListener("scroll", updateGeometry, true);
    window.requestAnimationFrame(() => onboardingDialogRef.current?.focus());
    return () => {
      window.removeEventListener("resize", updateGeometry);
      window.removeEventListener("scroll", updateGeometry, true);
    };
  }, [onboardingStep, workspaceView]);

  useEffect(() => {
    if (onboardingStep === null) return;
    const handleTourKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "complete");
        setOnboardingStep(null);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setOnboardingStep((current) =>
          current === null ? null : Math.min(current + 1, ONBOARDING_TOUR_STEPS.length - 1),
        );
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setOnboardingStep((current) => (current === null ? null : Math.max(current - 1, 0)));
      }
    };
    window.addEventListener("keydown", handleTourKeyDown);
    return () => window.removeEventListener("keydown", handleTourKeyDown);
  }, [onboardingStep]);

  useEffect(() => {
    const reviewNeedsAttention =
      pendingAiProposal !== null ||
      pendingAiImportProposal !== null ||
      (mcpActivity.phase === "succeeded" && mcpActivity.completionKind === "review_ready");
    if (reviewNeedsAttention) setOnboardingStep(null);
  }, [mcpActivity.completionKind, mcpActivity.phase, pendingAiImportProposal, pendingAiProposal]);

  useEffect(() => {
    if (workspaceView !== "ai") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const response = await fetch("/api/mcp-control", { cache: "no-store" });
        if (response.ok && !cancelled) {
          const data = (await response.json()) as McpControlResponse;
          setMcpControl(data.control);
        }
      } catch {
        // The control center remains usable after the next successful local poll.
      }
      if (!cancelled) timer = setTimeout(poll, 1_200);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [workspaceView]);


  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      let nextDelay = 900;
      try {
        const response = await fetch("/api/ai-activity", { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as McpActivityResponse;
          if (!cancelled) setMcpActivity(data.activity);
          if (data.activity.phase === "working") nextDelay = 220;
        }
      } catch {
        // The activity display is best-effort and never blocks chart editing.
      }
      if (!cancelled) timer = setTimeout(poll, nextDelay);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

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

  const changePresentationMode = useCallback(
    (mode: ChartPresentationMode) => {
      window.localStorage.setItem(PRESENTATION_STORAGE_KEY, mode);
      setPresentationMode(mode);
      setSelectedEdgeId("");
      setNotice(
        mode === "compact"
          ? "Compact groups enabled. Major units remain cards, terminal level 4 assignments are listed inside their parent, and level 3 connectors enter from the left. Chart data is unchanged."
          : "Individual cards enabled. Every chart record is shown as its own card using its saved position.",
      );
      window.requestAnimationFrame(() => {
        void fitView({ duration: 420, padding: 0.14 });
      });
    },
    [fitView],
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
      setSelectedEdgeId("");
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

  const dismissMcpActivity = useCallback(async (activityId = mcpActivity.activityId) => {
    setDismissedMcpRevision(mcpActivity.revision);
    if (!activityId) return;
    try {
      await fetch("/api/ai-activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "dismiss", activityId }),
      });
    } catch {
      // The visual receipt is best-effort; proposal review remains available in this session.
    }
  }, [mcpActivity.activityId, mcpActivity.revision]);

  const showAiProposal = useCallback(
    (proposal: AiChartProposal) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveGenerationRef.current += 1;
      hydratedChartRef.current = null;
      setAiProposalBusy(null);
      setAiProposalError("");
      setPendingAiProposal(proposal);
      setAiReviewCategory("all");
      setActiveChartId(proposal.chartId);
      setNodes(proposal.proposed.nodes);
      setEdges(proposal.proposed.edges);
      setSelectedId(proposal.summary.changedNodeIds[0] ?? proposal.proposed.nodes[0]?.id ?? "");
      setSelectedEdgeId("");
      setCollapsedIds(new Set());
      setWorkspaceView("canvas");
      setSaveState("proposal");
      setNotice(
        `Previewing ${proposal.summary.total} proposed AI change${proposal.summary.total === 1 ? "" : "s"}. Nothing has been saved yet.`,
      );
      window.requestAnimationFrame(() => void fitView({ duration: 420, padding: 0.14 }));
    },
    [fitView, setEdges, setNodes],
  );

  const reviewPendingAiProposal = useCallback(
    async (proposalId = pendingAiProposalSummaries[0]?.id) => {
      if (!proposalId || aiProposalBusy) return;
      setAiProposalBusy("load");
      try {
        const response = await fetch(
          `/api/ai-proposals?proposalId=${encodeURIComponent(proposalId)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as AiProposalResponse & { error?: string };
        if (!response.ok || !data.proposal) {
          throw new Error(data.error ?? "The pending AI proposal could not be loaded.");
        }
        showAiProposal(data.proposal);
      } catch (error) {
        await loadPendingAiProposals().catch(() => undefined);
        setSaveState("error");
        setNotice(
          error instanceof Error ? error.message : "The pending AI proposal could not be loaded.",
        );
      } finally {
        setAiProposalBusy(null);
      }
    },
    [aiProposalBusy, loadPendingAiProposals, pendingAiProposalSummaries, showAiProposal],
  );

  const deferAiProposal = useCallback(() => {
    const proposal = pendingAiProposal;
    if (!proposal || aiProposalBusy) return;
    setPendingAiProposal(null);
    setNodes(proposal.current.nodes);
    setEdges(proposal.current.edges);
    setSelectedId(proposal.current.nodes[0]?.id ?? "");
    setSelectedEdgeId("");
    setSaveState("saved");
    setDismissedMcpRevision(mcpActivity.revision);
    const deadline = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(proposal.expiresAt));
    setNotice(
      `Review deferred. The saved chart is unchanged, and this proposal remains available from the pending-review banner until ${deadline}.`,
    );
    window.requestAnimationFrame(() => {
      hydratedChartRef.current = proposal.current.id;
      void fitView({ duration: 320, padding: 0.14 });
    });
  }, [aiProposalBusy, fitView, mcpActivity.revision, pendingAiProposal, setEdges, setNodes]);

  const startOnboardingTour = useCallback(() => {
    setOnboardingStep(0);
  }, []);

  const finishOnboardingTour = useCallback((noticeMessage: string) => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "complete");
    } catch {
      // The tour can still close when local preference storage is unavailable.
    }
    setOnboardingStep(null);
    setNotice(noticeMessage);
  }, []);

  const reviewMcpUpdate = useCallback(async () => {
    if (!mcpActivity.chartId && !mcpActivity.proposalId) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveGenerationRef.current += 1;
    hydratedChartRef.current = null;
    try {
      if (mcpActivity.completionKind === "review_ready" && mcpActivity.proposalId) {
        if (mcpActivity.operation === "stage_normalized_import") {
          setAiImportBusy("load");
          const response = await fetch(
            `/api/ai-import-proposals?proposalId=${encodeURIComponent(mcpActivity.proposalId)}`,
            { cache: "no-store" },
          );
          const data = (await response.json()) as AiImportProposalResponse;
          if (!response.ok || !data.proposal) {
            throw new Error(data.error ?? "The AI import proposal could not be loaded.");
          }
          setPendingAiImportProposal(data.proposal);
          setAiImportError("");
          setWorkspaceView("sources");
          setNotice(
            `Reviewing ${data.proposal.proposed.nodes.length} proposed units. No chart has been created.`,
          );
          setDismissedMcpRevision(mcpActivity.revision);
          return;
        }
        setAiProposalBusy("load");
        const response = await fetch(
          `/api/ai-proposals?proposalId=${encodeURIComponent(mcpActivity.proposalId)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as AiProposalResponse & { error?: string };
        if (!response.ok || !data.proposal) {
          throw new Error(data.error ?? "The AI proposal could not be loaded.");
        }
        showAiProposal(data.proposal);
        setDismissedMcpRevision(mcpActivity.revision);
        return;
      }
      const response = await fetch("/api/charts", { cache: "no-store" });
      if (!response.ok) throw new Error("The updated chart library could not be loaded.");
      const data = (await response.json()) as ChartLibraryResponse;
      const updatedChart = data.charts.find(
        (chart) => chart.id === mcpActivity.chartId,
      );
      setCharts(data.charts);
      if (!updatedChart) {
        setNotice("The AI-updated chart is no longer available in the local library.");
        setDismissedMcpRevision(mcpActivity.revision);
        return;
      }
      openChart(updatedChart, "canvas");
      setSaveState("saved");
      setNotice(
        `Loaded ${updatedChart.name} from the local database so you can review the AI-assisted update.`,
      );
      setDismissedMcpRevision(mcpActivity.revision);
    } catch (error) {
      setSaveState("error");
      setNotice(
        error instanceof Error ? error.message : "The AI-assisted update could not be loaded.",
      );
    } finally {
      setAiProposalBusy(null);
      setAiImportBusy(null);
    }
  }, [mcpActivity, openChart, showAiProposal]);

  const loadAiActivities = useCallback(async (chartId: string) => {
    const response = await fetch(
      `/api/ai-proposals?chartId=${encodeURIComponent(chartId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("AI-assisted activity could not be loaded.");
    const data = (await response.json()) as AiActivityHistoryResponse;
    setAiActivities(data.activities);
  }, []);

  const resolveAiProposal = useCallback(
    async (action: "accept" | "reject") => {
      const proposal = pendingAiProposal;
      if (!proposal || aiProposalBusy) return;
      setAiProposalBusy(action);
      setAiProposalError("");
      const controller = new AbortController();
      const requestTimeout = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch("/api/ai-proposals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, proposalId: proposal.id }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          chart?: ChartDocument;
          rejected?: string;
          error?: string;
        };
        if (!response.ok) {
          if (response.status === 404 || response.status === 409) {
            const libraryResponse = await fetch("/api/charts", { cache: "no-store" });
            if (libraryResponse.ok) {
              const library = (await libraryResponse.json()) as ChartLibraryResponse;
              const currentChart = library.charts.find(
                (chart) => chart.id === proposal.chartId,
              );
              setPendingAiProposal(null);
              setPendingAiProposalSummaries((current) =>
                current.filter((item) => item.id !== proposal.id),
              );
              setCharts(library.charts);
              if (currentChart) {
                setNodes(currentChart.nodes);
                setEdges(currentChart.edges);
                setSelectedId(currentChart.nodes[0]?.id ?? "");
                setSelectedEdgeId("");
                window.requestAnimationFrame(() => {
                  hydratedChartRef.current = currentChart.id;
                  void fitView({ duration: 320, padding: 0.14 });
                });
              }
            }
          }
          throw new Error(data.error ?? "The AI proposal could not be resolved.");
        }
        const resolvedChart = action === "accept" ? data.chart : proposal.current;
        if (!resolvedChart) throw new Error("The applied chart was not returned by local storage.");
        setPendingAiProposal(null);
        setPendingAiProposalSummaries((current) =>
          current.filter((item) => item.id !== proposal.id),
        );
        setCharts((current) =>
          current.map((chart) => (chart.id === resolvedChart.id ? resolvedChart : chart)),
        );
        setNodes(resolvedChart.nodes);
        setEdges(resolvedChart.edges);
        setSelectedId(resolvedChart.nodes[0]?.id ?? "");
        setSelectedEdgeId("");
        setSaveState("saved");
        setNotice(
          action === "accept"
            ? `Applied ${proposal.summary.total} reviewed AI change${proposal.summary.total === 1 ? "" : "s"} to ${resolvedChart.name}. Save a named version when this working draft is ready for a checkpoint.`
            : `Rejected the AI proposal. ${resolvedChart.name} was not changed.`,
        );
        void dismissMcpActivity();
        await loadAiActivities(resolvedChart.id).catch(() => undefined);
        window.requestAnimationFrame(() => {
          hydratedChartRef.current = resolvedChart.id;
          void fitView({ duration: 320, padding: 0.14 });
        });
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "AbortError"
            ? "The local app did not answer within 15 seconds. The proposal is still unsaved; try again or restart OrgChart Studio."
            : error instanceof Error
              ? error.message
              : "The AI proposal could not be resolved.";
        setAiProposalError(message);
        setNotice(message);
      } finally {
        window.clearTimeout(requestTimeout);
        setAiProposalBusy(null);
      }
    },
    [
      aiProposalBusy,
      dismissMcpActivity,
      fitView,
      loadAiActivities,
      pendingAiProposal,
      setEdges,
      setNodes,
    ],
  );

  const resolveAiImportProposal = useCallback(
    async (action: "accept" | "reject") => {
      const proposal = pendingAiImportProposal;
      if (!proposal || aiImportBusy) return;
      setAiImportBusy(action);
      setAiImportError("");
      const controller = new AbortController();
      const requestTimeout = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch("/api/ai-import-proposals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, proposalId: proposal.id }),
          signal: controller.signal,
        });
        const data = (await response.json()) as AiImportProposalResponse;
        if (!response.ok) {
          throw new Error(data.error ?? "The AI import proposal could not be resolved.");
        }
        setPendingAiImportProposal(null);
        void dismissMcpActivity();
        if (action === "reject") {
          setNotice(`Rejected the proposed import for ${proposal.chartName}. No chart was created.`);
          return;
        }
        if (!data.chart) throw new Error("The new chart was not returned by local storage.");
        const libraryResponse = await fetch("/api/charts", { cache: "no-store" });
        const library = libraryResponse.ok
          ? ((await libraryResponse.json()) as ChartLibraryResponse)
          : { charts: [...chartsRef.current, data.chart] };
        setCharts(library.charts);
        openChart(data.chart, "sources");
        await loadImportIntakes().catch(() => undefined);
        setNotice(
          `Created ${data.chart.name} from the reviewed AI import with ${data.chart.sources.length} retained source record${data.chart.sources.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "AbortError"
            ? "The local app did not answer within 15 seconds. The import remains unsaved; try again or restart OrgChart Studio."
            : error instanceof Error
              ? error.message
              : "The AI import proposal could not be resolved.";
        setAiImportError(message);
        setNotice(message);
      } finally {
        window.clearTimeout(requestTimeout);
        setAiImportBusy(null);
      }
    },
    [aiImportBusy, dismissMcpActivity, loadImportIntakes, openChart, pendingAiImportProposal],
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
    const savedContent = JSON.stringify({
      nodes: storageSafeNodes(chartSnapshot.nodes),
      edges: chartSnapshot.edges,
    });
    const editorContent = JSON.stringify({
      nodes: storageSafeNodes(nodes),
      edges,
    });
    if (savedContent === editorContent) {
      setSaveState("saved");
      return;
    }
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
        const response = await sendSave(chartToSave);
        const data = (await response.json()) as {
          chart?: ChartDocument;
          error?: string;
          currentVersion?: number;
          currentUpdatedAt?: string;
        };
        if (
          response.status === 409 &&
          saveGeneration === saveGenerationRef.current
        ) {
          setSaveState("error");
          setNotice(
            "A newer local update was saved while you were editing. Review that update before making more changes; your older draft was not allowed to overwrite it.",
          );
          return;
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

  const compactPresentation = useMemo(
    () => deriveCompactPresentation(nodes, edges),
    [edges, nodes],
  );
  const compactLayoutNodes = useMemo(
    () => arrangeCompactPresentation(nodes, edges, compactPresentation),
    [compactPresentation, edges, nodes],
  );
  const compactPositionById = useMemo(
    () => new Map(compactLayoutNodes.map((flowNode) => [flowNode.id, flowNode.position])),
    [compactLayoutNodes],
  );
  const presentationHiddenIds = useMemo(() => {
    const hidden = presentationMode === "compact" ? new Set<string>() : new Set(hiddenIds);
    if (presentationMode === "compact") {
      compactPresentation.listedNodeIds.forEach((id) => hidden.add(id));
    }
    return hidden;
  }, [compactPresentation.listedNodeIds, hiddenIds, presentationMode]);
  const presentationNodes = useMemo(
    () =>
      nodes.map((flowNode) => {
        if (presentationMode === "individual") {
          return {
            ...flowNode,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
            style: { ...flowNode.style, width: NODE_WIDTH, height: NODE_HEIGHT },
          };
        }
        const level = compactPresentation.levels.get(flowNode.id) ?? 1;
        const entries = compactPresentation.entriesByParent.get(flowNode.id) ?? [];
        const sidecar = compactPresentation.sidecarNodeIds.has(flowNode.id);
        const dimensions = compactNodeDimensions(level, entries.length, sidecar);
        return {
          ...flowNode,
          width: dimensions.width,
          height: dimensions.height,
          measured: { width: dimensions.width, height: dimensions.height },
          position: compactPositionById.get(flowNode.id) ?? flowNode.position,
          style: {
            ...flowNode.style,
            width: dimensions.width,
            height: dimensions.height,
          },
        };
      }),
    [
      compactPositionById,
      compactPresentation.entriesByParent,
      compactPresentation.levels,
      compactPresentation.sidecarNodeIds,
      nodes,
      presentationMode,
    ],
  );
  const presentationEdges = useMemo(
    () =>
      edges
        .filter(
          (edge) =>
            !presentationHiddenIds.has(edge.source) &&
            !presentationHiddenIds.has(edge.target),
        )
        .map((edge) =>
          presentationMode === "compact" && edge.data?.manualRoute
            ? { ...edge, data: { ...edge.data, manualRoute: undefined } }
            : edge,
        ),
    [edges, presentationHiddenIds, presentationMode],
  );
  const visiblePresentationNodes = useMemo(
    () => presentationNodes.filter((flowNode) => !presentationHiddenIds.has(flowNode.id)),
    [presentationHiddenIds, presentationNodes],
  );
  const routingNodes = useDeferredValue(visiblePresentationNodes);
  const routingEdges = useDeferredValue(presentationEdges);

  const edgeRoutes = useMemo(
    () =>
      buildOrthogonalEdgeRoutes(
        routingNodes.map((flowNode) => ({
          id: flowNode.id,
          x: flowNode.position.x,
          y: flowNode.position.y,
          width: Number(flowNode.style?.width) || NODE_WIDTH,
          height: Number(flowNode.style?.height) || NODE_HEIGHT,
          targetSide:
            presentationMode === "compact" &&
            ((compactPresentation.levels.get(flowNode.id) ?? 1) >= 3 ||
              compactPresentation.sidecarNodeIds.has(flowNode.id))
              ? "left"
              : "top",
        })),
        routingEdges,
        presentationMode === "compact" ? "combed" : connectorRoutingMode,
      ),
    [
      compactPresentation.levels,
      compactPresentation.sidecarNodeIds,
      connectorRoutingMode,
      presentationMode,
      routingEdges,
      routingNodes,
    ],
  );

  const startRouteCornerDrag = useCallback(
    (
      edgeId: string,
      route: OrthogonalEdgeRoute,
      control: RouteCornerControl,
      pointer: EdgeRoutePoint,
    ) => {
      if (control.axis === "none") return;
      const edge = edges.find((candidate) => candidate.id === edgeId);
      if (!edge) return;
      const manualRoute =
        manualEdgeRouteForEdge(edge) ?? manualEdgeRouteFromRoute(route);
      if (!manualRoute?.points[control.pointIndex]) return;
      routeCornerDragRef.current = {
        edgeId,
        pointIndex: control.pointIndex,
        allowedAxis: control.axis,
        startPointer: { ...pointer },
        startPoint: { ...manualRoute.points[control.pointIndex] },
        manualRoute,
        snapshot: editorSnapshot(
          nodes,
          edges,
          selectedId,
          "moving and pinning a connector lane",
        ),
        moved: false,
      };
    },
    [edges, nodes, selectedId],
  );

  const dragRouteCorner = useCallback(
    (edgeId: string, pointer: EdgeRoutePoint) => {
      const drag = routeCornerDragRef.current;
      if (!drag || drag.edgeId !== edgeId) return;
      const deltaX = pointer.x - drag.startPointer.x;
      const deltaY = pointer.y - drag.startPointer.y;
      if (!drag.lockedAxis) {
        if (drag.allowedAxis === "x" || drag.allowedAxis === "y") {
          drag.lockedAxis = drag.allowedAxis;
        } else {
          if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 1) return;
          drag.lockedAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
        }
      }
      const axis = drag.lockedAxis;
      const nextValue =
        drag.startPoint[axis] + (axis === "x" ? deltaX : deltaY);
      const manualRoute = moveManualEdgeRouteLane(
        drag.manualRoute,
        drag.pointIndex,
        axis,
        nextValue,
      );
      drag.moved = true;
      setEdges((current) =>
        current.map((edge) =>
          edge.id === edgeId ? edgeWithManualRoute(edge, manualRoute) : edge,
        ),
      );
    },
    [setEdges],
  );

  const finishRouteCornerDrag = useCallback(
    (edgeId: string) => {
      const drag = routeCornerDragRef.current;
      if (!drag || drag.edgeId !== edgeId) return;
      routeCornerDragRef.current = null;
      if (!drag.moved) return;
      pushUndoSnapshot(drag.snapshot);
      setNotice(
        "Connector lane pinned. Its saved route remains horizontal and vertical and will be used by exports.",
      );
    },
    [pushUndoSnapshot],
  );

  const sourcePortCounts = useMemo(() => {
    const counts = new Map<string, number>();
    presentationEdges.forEach((edge) => {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
    });
    return counts;
  }, [presentationEdges]);

  const targetPortOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    const nodeById = new Map(routingNodes.map((flowNode) => [flowNode.id, flowNode]));
    edgeRoutes.forEach((route) => {
      const targetNode = nodeById.get(route.targetId);
      const endpoint = route.points.at(-1);
      if (!targetNode || !endpoint) return;
      const targetWidth = Number(targetNode.style?.width) || NODE_WIDTH;
      const targetHeight = Number(targetNode.style?.height) || NODE_HEIGHT;
      offsets.set(
        route.targetId,
        route.targetSide === "left"
          ? endpoint.y - (targetNode.position.y + targetHeight / 2)
          : endpoint.x - (targetNode.position.x + targetWidth / 2),
      );
    });
    return offsets;
  }, [edgeRoutes, routingNodes]);

  const aiPreviewMarks = useMemo(() => {
    if (!pendingAiProposal || pendingAiProposal.chartId !== activeChartId) return null;
    return {
      addedNodes: new Set(pendingAiProposal.summary.addedNodeIds),
      changedNodes: new Set(pendingAiProposal.summary.changedNodeIds),
      addedEdges: new Set(pendingAiProposal.summary.addedEdgeIds),
      changedEdges: new Set(pendingAiProposal.summary.changedEdgeIds),
    };
  }, [activeChartId, pendingAiProposal]);

  const selectCompactEntry = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedEdgeId("");
    setNotice("Listed assignment selected. Its complete record remains available in the detail panel.");
  }, []);

  const displayNodes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesQuery = (flowNode: OrgFlowNode) =>
      normalizedQuery.length > 1 &&
      [
        flowNode.data.unit.name,
        flowNode.data.unit.shortName,
        flowNode.data.unit.positionTitle,
        flowNode.data.unit.assignmentLabel,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    const nodeById = new Map(nodes.map((flowNode) => [flowNode.id, flowNode]));

    return presentationNodes.map((flowNode) => {
      const compactEntries =
        presentationMode === "compact"
          ? (compactPresentation.entriesByParent.get(flowNode.id) ?? []).map((entry) => {
              const entryNode = nodeById.get(entry.id);
              return {
                ...entry,
                selected: entry.id === selectedId,
                isSearchMatch: entryNode ? matchesQuery(entryNode) : false,
                aiChange: aiPreviewMarks?.addedNodes.has(entry.id)
                  ? ("added" as const)
                  : aiPreviewMarks?.changedNodes.has(entry.id)
                    ? ("changed" as const)
                    : undefined,
              };
            })
          : [];
      const level = compactPresentation.levels.get(flowNode.id) ?? 1;
      const targetSide: "top" | "left" =
        presentationMode === "compact" &&
        (level >= 3 || compactPresentation.sidecarNodeIds.has(flowNode.id))
          ? "left"
          : "top";
      return {
        ...flowNode,
        hidden: presentationHiddenIds.has(flowNode.id),
        data: {
          ...flowNode.data,
          collapsed: presentationMode === "individual" && collapsedIds.has(flowNode.id),
          childCount: edges.filter((edge) => edge.source === flowNode.id).length,
          sourcePortCount: sourcePortCounts.get(flowNode.id) ?? 0,
          targetPortOffset: targetPortOffsets.get(flowNode.id) ?? 0,
          targetSide,
          hierarchyLevel: level,
          presentationMode,
          compactEntries,
          compactSidecar: compactPresentation.sidecarNodeIds.has(flowNode.id),
          visualWidth: Number(flowNode.style?.width) || NODE_WIDTH,
          visualHeight: Number(flowNode.style?.height) || NODE_HEIGHT,
          aiChange: aiPreviewMarks?.addedNodes.has(flowNode.id)
            ? "added"
            : aiPreviewMarks?.changedNodes.has(flowNode.id)
              ? "changed"
              : (undefined as "added" | "changed" | undefined),
          isSearchMatch: matchesQuery(flowNode) || compactEntries.some((entry) => entry.isSearchMatch),
          onToggleCollapse: presentationMode === "individual" ? toggleCollapse : undefined,
          onSelectCompactEntry: selectCompactEntry,
        },
      };
    });
  }, [
    aiPreviewMarks,
    collapsedIds,
    compactPresentation.entriesByParent,
    compactPresentation.levels,
    compactPresentation.sidecarNodeIds,
    edges,
    nodes,
    presentationHiddenIds,
    presentationMode,
    presentationNodes,
    searchQuery,
    selectedId,
    selectCompactEntry,
    sourcePortCounts,
    targetPortOffsets,
    toggleCollapse,
  ]);

  const displayEdges = useMemo(
    () => {
      return presentationEdges.flatMap((edge) => {
        const route = edgeRoutes.get(edge.id);
        if (!route) return [];
        return [{
          ...edge,
          type: "orgRelationship",
          selectable: presentationMode === "individual",
          focusable: presentationMode === "individual",
          selected: presentationMode === "individual" && edge.id === selectedEdgeId,
          sourceHandle: "org-source",
          targetHandle: route.targetHandleId,
          data: {
            ...edge.data,
            aiChange: aiPreviewMarks?.addedEdges.has(edge.id)
              ? "added"
              : aiPreviewMarks?.changedEdges.has(edge.id)
                ? "changed"
                : undefined,
            route,
            onCornerDragStart: startRouteCornerDrag,
            onCornerDrag: dragRouteCorner,
            onCornerDragEnd: finishRouteCornerDrag,
          },
          hidden: false,
        }];
      });
    },
    [
      dragRouteCorner,
      aiPreviewMarks,
      edgeRoutes,
      presentationEdges,
      presentationMode,
      finishRouteCornerDrag,
      selectedEdgeId,
      startRouteCornerDrag,
    ],
  );

  const selectedNode =
    nodes.find((flowNode) => flowNode.id === selectedId) ?? nodes[0];
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const selectedEdgeRoute = selectedEdgeId ? edgeRoutes.get(selectedEdgeId) : undefined;
  const selectedEdgeSource = nodes.find((node) => node.id === selectedEdge?.source);
  const selectedEdgeTarget = nodes.find((node) => node.id === selectedEdge?.target);

  const pinSelectedConnector = useCallback(() => {
    if (!selectedEdge || !selectedEdgeRoute || selectedEdgeRoute.manual) return;
    const manualRoute = manualEdgeRouteFromRoute(selectedEdgeRoute);
    if (!manualRoute) {
      setNotice("This connector is already a straight orthogonal line with no lane corners to pin.");
      return;
    }
    recordCurrentState("pinning a connector route");
    setEdges((current) =>
      current.map((edge) =>
        edge.id === selectedEdge.id ? edgeWithManualRoute(edge, manualRoute) : edge,
      ),
    );
    setNotice(
      "Current connector corners pinned. Drag a pin to move that horizontal or vertical lane.",
    );
  }, [recordCurrentState, selectedEdge, selectedEdgeRoute, setEdges]);

  const resetSelectedConnector = useCallback(() => {
    if (!selectedEdge || !manualEdgeRouteForEdge(selectedEdge)) return;
    recordCurrentState("resetting a connector route");
    setEdges((current) =>
      current.map((edge) =>
        edge.id === selectedEdge.id ? edgeWithManualRoute(edge) : edge,
      ),
    );
    setNotice(
      "Connector pins cleared. Automatic non-overlapping routing is controlling this relationship again.",
    );
  }, [recordCurrentState, selectedEdge, setEdges]);
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
        presentationMode,
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
  }, [
    activeChart,
    connectorRoutingMode,
    edges,
    effectiveExportAudience,
    exportPreset,
    nodes,
    presentationMode,
  ]);
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
      const [response, activityResponse] = await Promise.all([
        fetch(
          `/api/charts?resource=versions&chartId=${encodeURIComponent(chartId)}`,
          { cache: "no-store" },
        ),
        fetch(
          `/api/ai-proposals?chartId=${encodeURIComponent(chartId)}`,
          { cache: "no-store" },
        ),
      ]);
      if (!response.ok) throw new Error("Version history could not be loaded.");
      const data = (await response.json()) as ChartVersionsResponse;
      if (activityResponse.ok) {
        const activityData = (await activityResponse.json()) as AiActivityHistoryResponse;
        setAiActivities(activityData.activities);
      }
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
      await loadAiActivities(data.chart.id).catch(() => undefined);
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
      const visibleId =
        presentationMode === "compact" && compactPresentation.listedNodeIds.has(id)
          ? (compactPresentation.parentById.get(id) ?? id)
          : id;
      window.requestAnimationFrame(() => {
        void fitView({ nodes: [{ id: visibleId }], duration: 420, padding: 1.8 });
      });
    },
    [compactPresentation.listedNodeIds, compactPresentation.parentById, fitView, presentationMode],
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
      const visibleId =
        presentationMode === "compact" && compactPresentation.listedNodeIds.has(match.id)
          ? (compactPresentation.parentById.get(match.id) ?? match.id)
          : match.id;
      window.requestAnimationFrame(() => {
        void fitView({ nodes: [{ id: visibleId }], duration: 420, padding: 1.8 });
      });
    }
  };

  const handleNodeClick: NodeMouseHandler<OrgFlowNode> = (_event, flowNode) => {
    setSelectedId(flowNode.id);
    setSelectedEdgeId("");
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
      sourceLocator: String(formData.get("sourceLocator") ?? "").trim(),
      sourceCertainty: String(
        formData.get("sourceCertainty") ?? "confirmed",
      ) as SourceCertainty,
      reviewNote: String(formData.get("reviewNote") ?? "").trim(),
      planningState: String(
        formData.get("planningState") ?? "current",
      ) as PlanningState,
      compactDisplay: String(
        formData.get("compactDisplay") ?? "auto",
      ) as CompactDisplay,
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
          sourceLocator: "",
          sourceCertainty: "confirmed",
          reviewNote: "",
          planningState: "current",
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

  const createImportIntake = async () => {
    if (!intakeName.trim() || !intakeFiles.length || intakeBusy) {
      setNotice("Name the intake and choose at least one PowerPoint, Word, PDF, PNG, or JPEG source file.");
      return;
    }
    setIntakeBusy(true);
    try {
      const formData = new FormData();
      formData.set("name", intakeName.trim());
      intakeFiles.forEach((file) => formData.append("evidence", file));
      const response = await fetch("/api/import-intakes", { method: "POST", body: formData });
      const data = (await response.json()) as { intake?: ImportIntake; error?: string };
      if (!response.ok || !data.intake) {
        throw new Error(data.error ?? "The source intake could not be created.");
      }
      setImportIntakes((current) => [data.intake!, ...current]);
      setImportIntakeId(data.intake.id);
      setIntakeName("");
      setIntakeFiles([]);
      setNotice(
        `${data.intake.name} is ready. Its ${data.intake.files.length} original source file${data.intake.files.length === 1 ? " is" : "s are"} retained locally and can be linked to an AI or manual import.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The source intake could not be created.");
    } finally {
      setIntakeBusy(false);
    }
  };

  const discardImportIntake = async (intake: ImportIntake) => {
    if (!window.confirm(`Discard the unused source intake “${intake.name}” and its retained files?`)) return;
    setIntakeBusy(true);
    try {
      const response = await fetch("/api/import-intakes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "discard", intakeId: intake.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The source intake could not be discarded.");
      setImportIntakes((current) => current.filter((candidate) => candidate.id !== intake.id));
      setImportIntakeId((current) => (current === intake.id ? "" : current));
      setNotice(`${intake.name} and its unused local source files were discarded.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The source intake could not be discarded.");
    } finally {
      setIntakeBusy(false);
    }
  };

  const updateMcpControl = async (
    patch: Partial<Pick<McpControlState, "paused" | "chartScope" | "allowedChartIds">>,
  ) => {
    const current = mcpControl ?? {
      paused: false,
      chartScope: "all" as const,
      allowedChartIds: [],
      revision: 0,
      events: [],
    };
    setMcpControlBusy(true);
    try {
      const response = await fetch("/api/mcp-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "configure", ...current, ...patch }),
      });
      const data = (await response.json()) as McpControlResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Local AI controls could not be updated.");
      setMcpControl(data.control);
      setNotice(
        data.control.paused
          ? "Local AI access is paused. MCP reads and writes are blocked until you resume it."
          : data.control.chartScope === "selected"
            ? `Local AI access is limited to ${data.control.allowedChartIds.length} selected chart${data.control.allowedChartIds.length === 1 ? "" : "s"}.`
            : "Local AI access is active for charts you explicitly ask the assistant to use.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Local AI controls could not be updated.");
    } finally {
      setMcpControlBusy(false);
    }
  };

  const stageChartMerge = async () => {
    if (!comparisonSource || !comparisonTarget || !chartComparison || comparisonBusy) return;
    if (!chartComparison.totalChanges) {
      setNotice("These two charts have no structural, content, or layout differences to merge.");
      return;
    }
    setComparisonBusy(true);
    try {
      const proposed = mergeSourceIntoTarget(comparisonTarget, comparisonSource);
      const response = await fetch("/api/ai-proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stage", chart: proposed }),
      });
      const data = (await response.json()) as AiProposalResponse & { error?: string };
      if (!response.ok || !data.proposal) {
        throw new Error(data.error ?? "The chart merge proposal could not be staged.");
      }
      showAiProposal(data.proposal);
      setNotice(
        `Previewing ${comparisonSource.name} as a merge proposal for ${comparisonTarget.name}. The target is unchanged until Apply.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The chart merge proposal could not be staged.");
    } finally {
      setComparisonBusy(false);
    }
  };

  const importFormData = (validateOnly: boolean) => {
    const formData = new FormData();
    if (importFile) formData.set("file", importFile);
    importEvidenceFiles.forEach((file) => formData.append("evidence", file));
    if (importIntakeId) formData.set("intakeId", importIntakeId);
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
      setImportIntakeId("");
      setImportPreview(null);
      setImportReviewed(false);
      setNotice(
        `${data.chart.name} was imported as a draft with ${data.chart.sources.length} immutable source record${data.chart.sources.length === 1 ? "" : "s"}.`,
      );
      openChart(data.chart, "sources");
      await loadImportIntakes().catch(() => undefined);
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

  const requestDesktopQuit = async () => {
    const bridge = window.orgChartDesktop;
    if (!bridge || quitBusy || saveState === "saving") return;
    setQuitBusy(true);
    try {
      const approved = await bridge.requestQuit();
      if (!approved) setQuitBusy(false);
    } catch (error) {
      setQuitBusy(false);
      setNotice(
        error instanceof Error ? error.message : "The desktop app could not shut down.",
      );
    }
  };

  const chooseBackupScope = (scope: BackupScope) => {
    setBackupScope(scope);
    if (scope === "selected" && !selectedBackupCharts.length && activeChart) {
      setBackupSelectedChartIds(new Set([activeChart.id]));
    }
  };

  const setBackupChartSelected = (chartId: string, selected: boolean) => {
    setBackupSelectedChartIds((current) => {
      const next = new Set(current);
      if (selected) next.add(chartId);
      else next.delete(chartId);
      return next;
    });
  };

  const createBackup = async () => {
    setBackupMessage("");
    if (!charts.length) {
      setBackupMessage("Add or import at least one chart before creating a backup.");
      return;
    }
    if (backupScope === "selected" && !selectedBackupCharts.length) {
      setBackupMessage("Select at least one chart to include in this backup.");
      return;
    }
    if (backupProtection === "encrypted") {
      if (backupPassphrase.length < 12) {
        setBackupMessage("Use a passphrase containing at least 12 characters.");
        return;
      }
      if (backupPassphrase !== backupPassphraseConfirm) {
        setBackupMessage("The backup passphrases do not match.");
        return;
      }
    } else {
      if (!unencryptedBackupConfirmed) {
        setBackupMessage("Confirm that you understand the unencrypted backup will be readable.");
        return;
      }
      if (unencryptedCloudBackupBlocked) {
        setBackupMessage(
          "Choose a local backup folder or turn encryption on. Unencrypted backups cannot be saved directly to a cloud-sync folder.",
        );
        return;
      }
    }

    setBackupBusy("export");
    try {
      const backupQuery = new URLSearchParams();
      if (backupScope === "selected") {
        for (const chart of selectedBackupCharts) backupQuery.append("chartId", chart.id);
      }
      const queryString = backupQuery.toString();
      const response = await fetch(`/api/backups${queryString ? `?${queryString}` : ""}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const data = (await response.json()) as LibraryBackup & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The backup could not be prepared.");
      const packageValue =
        backupProtection === "encrypted"
          ? await encryptLibraryBackup(data, backupPassphrase)
          : data;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const scopeLabel = data.scope === "selected" ? `selected-${data.chartCount}` : "library";
      const fileName = `orgchart-studio-backup-${scopeLabel}-${backupProtection}-${stamp}.orgchart-backup`;
      const serialized = JSON.stringify(packageValue);
      const desktopBridge = window.orgChartDesktop;
      const savedBackup =
        desktopBridge && desktopStorage?.backupDirectory
          ? await desktopBridge.saveBackup(
              fileName,
              serialized,
              backupProtection === "encrypted",
            )
          : null;
      if (!savedBackup) {
        downloadTextFile(serialized, fileName, "application/json");
      }
      setBackupPassphrase("");
      setBackupPassphraseConfirm("");
      setUnencryptedBackupConfirmed(false);
      const protectionLabel = backupProtection === "encrypted" ? "Encrypted" : "Unencrypted";
      setBackupMessage(
        `${protectionLabel} backup created with ${data.chartCount} charts, ${data.versionCount ?? 0} saved versions, ${data.aiActivityCount ?? 0} AI review records, and ${data.sourceFileCount} stored source files.${savedBackup ? ` Saved to ${savedBackup.path}.` : " Downloaded through the browser."}`,
      );
      saveBackupHealth({
        ...backupHealth,
        lastBackupAt: new Date().toISOString(),
        lastBackupChartCount: data.chartCount,
        lastBackupEncrypted: backupProtection === "encrypted",
      });
      setNotice(
        backupProtection === "encrypted"
          ? savedBackup
            ? "Encrypted backup saved to the configured backup folder. Store its passphrase separately."
            : "Encrypted backup downloaded. Store its passphrase separately."
          : savedBackup
            ? "Unencrypted backup saved to the configured local folder. Anyone with the file can read its contents."
            : "Unencrypted backup downloaded. Anyone with the file can read its contents.",
      );
      saveBackupHealth({
        ...backupHealth,
        lastRestoreVerifiedAt: new Date().toISOString(),
      });
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "The backup could not be created.");
    } finally {
      setBackupBusy(null);
    }
  };

  const restoreBackup = async () => {
    setBackupMessage("");
    if (!backupFile) {
      setBackupMessage("Choose an OrgChart Studio backup file.");
      return;
    }
    if (backupFile.size > 38_000_000) {
      setBackupMessage("The backup exceeds the 38 MB prototype upload limit.");
      return;
    }

    setBackupBusy("restore");
    try {
      const envelope = JSON.parse(await backupFile.text()) as unknown;
      const opened = await openLibraryBackup(envelope, restorePassphrase);
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(opened.backup),
      });
      const result = (await response.json()) as {
        restoredChartCount?: number;
        restoredSourceFileCount?: number;
        restoredVersionCount?: number;
        restoredAiActivityCount?: number;
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
        `Restore merged ${result.restoredChartCount ?? 0} charts, ${result.restoredVersionCount ?? 0} saved versions, ${result.restoredAiActivityCount ?? 0} AI review records, and ${result.restoredSourceFileCount ?? 0} source files as new drafts.`,
      );
      setNotice(
        `${opened.protection === "encrypted" ? "Encrypted" : "Unencrypted"} backup restored by merge. Existing charts were not changed or deleted.`,
      );
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
        presentationMode,
      );
      const viewport = resolveExportViewport(scene, exportPreset);
      const fileStem = `${safeExportFileStem(activeChart.name)}-v${activeChart.version}-${effectiveExportAudience}-${presentationMode}-${exportPreset}`;
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
        `${format.toUpperCase()} exported from version ${activeChart.version} using the ${effectiveExportAudience} audience, ${presentationMode === "compact" ? "Compact groups" : "Individual cards"} presentation, and ${EXPORT_PRESETS.find((preset) => preset.id === exportPreset)?.label ?? exportPreset} profile.`,
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

  const mcpActivityVisible =
    mcpActivity.phase !== "idle" && mcpActivity.revision > dismissedMcpRevision;
  const mcpActivityTitle =
    mcpActivity.phase === "working"
      ? "AI preparing changes"
      : mcpActivity.phase === "succeeded"
        ? mcpActivity.completionKind === "review_ready"
          ? mcpActivity.operation === "stage_normalized_import"
            ? "AI import ready"
            : "AI changes ready"
          : "AI edit saved"
        : "AI edit needs attention";
  const visibleAiChanges = pendingAiProposal
    ? pendingAiProposal.changes.filter(
        (change) => aiReviewCategory === "all" || change.category === aiReviewCategory,
      )
    : [];
  const nextPendingAiProposal = pendingAiProposalSummaries[0];
  const reviewNeedsAttention =
    pendingAiProposal !== null ||
    pendingAiImportProposal !== null ||
    (mcpActivity.phase === "succeeded" && mcpActivity.completionKind === "review_ready");
  const currentTourStep =
    onboardingStep === null || reviewNeedsAttention
      ? null
      : ONBOARDING_TOUR_STEPS[onboardingStep];

  return (
    <div
      className={`studio-shell${
        mcpActivityVisible ? ` studio-shell--ai-${mcpActivity.phase}` : ""
      }${pendingAiProposal || pendingAiImportProposal ? " studio-shell--ai-review" : ""}`}
    >
      <div className="mcp-activity-frame" aria-hidden="true" />
      {mcpActivityVisible ? (
        <section
          className={`mcp-activity-hud mcp-activity-hud--${mcpActivity.phase}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="mcp-activity-hud__icon" aria-hidden="true">
            {mcpActivity.phase === "succeeded" ? (
              <Check size={18} weight="bold" />
            ) : mcpActivity.phase === "failed" ? (
              <WarningDiamond size={18} weight="bold" />
            ) : (
              <Robot size={18} weight="bold" />
            )}
          </span>
          <span className="mcp-activity-hud__copy">
            <small>Local MCP</small>
            <strong>{mcpActivityTitle}</strong>
            <span>
              {mcpActivity.label ?? "Updating chart"}
              {mcpActivity.chartName ? ` · ${mcpActivity.chartName}` : ""}
            </span>
          </span>
          {mcpActivity.phase === "succeeded" && (mcpActivity.chartId || mcpActivity.proposalId) ? (
            <button
              type="button"
              className="mcp-activity-hud__review"
              onClick={() => void reviewMcpUpdate()}
            >
              {aiProposalBusy === "load" || aiImportBusy === "load"
                ? "Loading…"
                : mcpActivity.completionKind === "review_ready"
                  ? mcpActivity.operation === "stage_normalized_import"
                    ? "Review import"
                    : "Review changes"
                  : "Review update"}
            </button>
          ) : null}
          <button
            type="button"
            className="mcp-activity-hud__dismiss"
            onClick={() => void dismissMcpActivity()}
            aria-label="Dismiss AI activity"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </section>
      ) : null}
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

        <button
          type="button"
          className="mobile-tour-launch"
          onClick={startOnboardingTour}
          data-tour-target="tips"
          aria-label="Open tips and tour"
        >
          <Question size={20} aria-hidden="true" />
        </button>

        <div className="topbar__status" data-tour-target="chart-status">
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
            {saveState === "saving"
              ? "Saving"
              : saveState === "proposal"
                ? "Not applied"
                : saveState === "error"
                  ? "Save issue"
                  : "Saved"}
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
          {storageMode === "desktop" ? (
            <button
              type="button"
              className="topbar__quit"
              data-desktop-quit
              onClick={() => void requestDesktopQuit()}
              disabled={quitBusy || saveState === "saving"}
              aria-label="Quit OrgChart Studio and stop its local server"
              title={
                saveState === "saving"
                  ? "Wait for the current save to finish before quitting"
                  : "Quit OrgChart Studio"
              }
            >
              <X size={15} weight="bold" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      <aside
        className="sidebar"
        aria-label="Workspace navigation"
        data-tour-target="navigation"
      >
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
            className={workspaceView === "backups" ? "is-active" : ""}
            onClick={() => setWorkspaceView("backups")}
          >
            <FileLock size={19} aria-hidden="true" />
            <span>Backup & restore</span>
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
            className={workspaceView === "ai" ? "is-active" : ""}
            onClick={() => setWorkspaceView("ai")}
            data-tour-target="ai-control"
          >
            <Robot size={19} aria-hidden="true" />
            <span>Local AI control</span>
            <span className={`nav-count ${mcpControl?.paused ? "nav-count--warning" : "nav-count--neutral"}`}>
              {mcpControl?.paused ? "Paused" : "On"}
            </span>
          </button>
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
          <button
            type="button"
            className="tour-nav-button"
            onClick={startOnboardingTour}
            data-tour-target="tips"
          >
            <Question size={19} aria-hidden="true" />
            <span>Tips &amp; tour</span>
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
        {nextPendingAiProposal && !pendingAiProposal ? (
          <section className="pending-review-banner" role="status" aria-live="polite">
            <span className="pending-review-banner__icon" aria-hidden="true">
              <Robot size={19} />
            </span>
            <span className="pending-review-banner__copy">
              <strong>
                {pendingAiProposalSummaries.length} AI proposal
                {pendingAiProposalSummaries.length === 1 ? "" : "s"} awaiting review
              </strong>
              <span>
                Nothing has been applied. Review the Before and After fields to decide what
                happens to the saved chart.
              </span>
            </span>
            <button
              type="button"
              className="button button--primary"
              onClick={() => void reviewPendingAiProposal(nextPendingAiProposal.id)}
              disabled={aiProposalBusy !== null}
            >
              {aiProposalBusy === "load" ? "Opening…" : "Review proposal"}
            </button>
          </section>
        ) : null}
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
              <div className="canvas-toolbar__mode">
                <div className="presentation-control" data-tour-target="presentation">
                  <span>
                    <strong>
                      Presentation
                      {presentationMode === "compact" ? (
                        <span
                          className="presentation-control__status"
                          title="Column stacks · fixed hierarchy rails · level 3 left entry"
                        >
                          Auto arranged
                        </span>
                      ) : null}
                    </strong>
                    <small>Changes the drawing, not the saved hierarchy</small>
                  </span>
                  <div role="group" aria-label="Chart presentation">
                    <button
                      type="button"
                      className={presentationMode === "compact" ? "is-active" : ""}
                      aria-pressed={presentationMode === "compact"}
                      onClick={() => changePresentationMode("compact")}
                    >
                      <Rows size={16} aria-hidden="true" />
                      Compact groups
                    </button>
                    <button
                      type="button"
                      className={presentationMode === "individual" ? "is-active" : ""}
                      aria-pressed={presentationMode === "individual"}
                      onClick={() => changePresentationMode("individual")}
                    >
                      <SquaresFour size={16} aria-hidden="true" />
                      Individual cards
                    </button>
                  </div>
                </div>
              </div>
              {presentationMode === "individual" ? (
                <div className="layout-control">
                  <div className="layout-control__field">
                    <label htmlFor="layout-mode">Card layout</label>
                    <select
                      id="layout-mode"
                      value={layoutMode}
                      onChange={(event) => setLayoutMode(event.target.value as LayoutMode)}
                      title="Choose how individual card positions are recalculated"
                    >
                      <option value="preserve">Preserve layout</option>
                      <option value="branch">Selected branch</option>
                      <option value="respect-pins">Respect pins</option>
                      <option value="full">Full layout</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="button button--primary layout-control__run"
                    onClick={() => void runLayout()}
                    disabled={isLayoutRunning}
                  >
                    <ArrowsOut size={17} aria-hidden="true" />
                    {isLayoutRunning ? "Laying out…" : "Run layout"}
                  </button>
                  <span className="layout-control__divider" aria-hidden="true" />
                  <div className="layout-control__field">
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
                  </div>
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
              ) : null}
              <div className="toolbar-actions" role="toolbar" aria-label="Chart actions">
                <div className="toolbar-actions__history" role="group" aria-label="Change history">
                  <button
                    type="button"
                    className="button button--secondary button--history"
                    onClick={undoChange}
                    disabled={!undoStack.length}
                    title="Undo organizational or presentation change"
                    aria-label="Undo organizational or presentation change"
                  >
                    <ArrowCounterClockwise size={17} aria-hidden="true" />
                    <span className="button-label">Undo</span>
                  </button>
                  <button
                    type="button"
                    className="button button--secondary button--history"
                    onClick={redoChange}
                    disabled={!redoStack.length}
                    title="Redo organizational or presentation change"
                    aria-label="Redo organizational or presentation change"
                  >
                    <ArrowClockwise size={17} aria-hidden="true" />
                    <span className="button-label">Redo</span>
                  </button>
                </div>
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

            {presentationMode === "individual" && selectedCardCount > 1 ? (
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

            {presentationMode === "individual" && selectedEdge && selectedEdgeRoute ? (
              <div
                className="route-editor-toolbar"
                role="toolbar"
                aria-label="Edit selected connector route"
              >
                <span className="route-editor-toolbar__relationship">
                  <PushPin
                    size={16}
                    weight={selectedEdgeRoute.manual ? "fill" : "regular"}
                    aria-hidden="true"
                  />
                  <strong>
                    {selectedEdgeSource?.data.unit.shortName ?? "Parent"} →{" "}
                    {selectedEdgeTarget?.data.unit.shortName ?? "Child"}
                  </strong>
                  <small>
                    {selectedEdgeRoute.manual
                      ? `${selectedEdgeRoute.controls.length} pinned corners`
                      : "Automatic route"}
                  </small>
                </span>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={pinSelectedConnector}
                  disabled={selectedEdgeRoute.manual || !selectedEdgeRoute.controls.length}
                  title="Keep the current orthogonal connector corners in their present locations"
                >
                  <PushPin size={16} aria-hidden="true" />
                  Pin current route
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={resetSelectedConnector}
                  disabled={!selectedEdgeRoute.manual}
                  title="Remove manual corner positions and calculate this connector automatically"
                >
                  <ArrowCounterClockwise size={16} aria-hidden="true" />
                  Reset connector
                </button>
                <span className="route-editor-toolbar__hint">
                  Drag a corner handle to move its lane. Corners never become diagonal.
                </span>
              </div>
            ) : null}

            <div
              className={`flow-surface ${marqueeSelectionEnabled ? "is-marquee-active" : ""} ${pendingAiProposal ? "is-ai-preview" : ""}`}
            >
              <p id="canvas-selection-help" className="sr-only">
                {presentationMode === "compact"
                  ? "Compact groups is a presentation-only view. Terminal assignments are listed inside their parent cards, and level 3 connectors enter from the left. Switch to Individual cards to move cards or edit connector routes."
                  : marqueeSelectionEnabled
                  ? "Area selection is on. Drag on empty canvas to draw a selection rectangle. Cards touched by the rectangle become a movable group. Control-click or Command-click adds individual cards. Hold Space while dragging to pan."
                  : "Area selection is off. Control-click or Command-click adds individual cards to a selection. Turn on Select area to draw a selection rectangle around multiple cards."}
              </p>
              <ReactFlow<OrgFlowNode>
                nodes={displayNodes}
                edges={displayEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={(changes) =>
                  onNodesChange(
                    presentationMode === "compact"
                      ? changes.filter((change) => change.type === "select")
                      : changes,
                  )
                }
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                onEdgeClick={(event, edge) => {
                  event.stopPropagation();
                  setSelectedEdgeId(edge.id);
                }}
                onPaneClick={() => setSelectedEdgeId("")}
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
                minZoom={presentationMode === "compact" ? 0.08 : 0.22}
                maxZoom={1.6}
                nodesConnectable={false}
                nodesDraggable={presentationMode === "individual" && !pendingAiProposal}
                deleteKeyCode={null}
                selectionKeyCode={null}
                selectionOnDrag={presentationMode === "individual" && marqueeSelectionEnabled}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode={["Control", "Meta"]}
                panOnDrag={presentationMode === "compact" || !marqueeSelectionEnabled}
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
              {presentationMode === "compact" ? (
                <>
                  <span><Rows size={14} aria-hidden="true" /> Terminal assignments are listed inside their parent card</span>
                  <span><TreeStructure size={14} aria-hidden="true" /> Level 3 cards use shared left-entry rails</span>
                  <span><SquaresFour size={14} aria-hidden="true" /> Switch to Individual cards to move cards or edit lines</span>
                </>
              ) : (
                <>
                  <span><MapPin size={14} weight="fill" aria-hidden="true" /> Dragging pins presentation only</span>
                  <span><PushPin size={14} aria-hidden="true" /> Click a connector to pin or reset its corners</span>
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
                </>
              )}
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
              <div className="table-panel__actions">
                <label>
                  <span>Organization state</span>
                  <select
                    value={planningFilter}
                    onChange={(event) => setPlanningFilter(event.target.value as PlanningFilter)}
                  >
                    <option value="all">Current and planned</option>
                    <option value="current">Current only</option>
                    <option value="planned">Planned only</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setWorkspaceView("canvas")}
                >
                  <SquaresFour size={17} aria-hidden="true" />
                  Return to chart
                </button>
              </div>
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
                    <th scope="col">State</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {planningFilteredNodes.map((flowNode) => {
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
                        <td>{planningStateForNode(flowNode) === "planned" ? "Planned" : "Current"}</td>
                        <td>
                          {flowNode.data.unit.sourceCertainty === "needs_review"
                            ? "Needs review"
                            : flowNode.data.unit.sourceCertainty === "inferred"
                              ? "Inferred"
                              : "Confirmed"}
                          {flowNode.data.unit.sourceLocator
                            ? ` · ${flowNode.data.unit.sourceLocator}`
                            : ""}
                        </td>
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
              <div>
                <span>Presentation</span>
                <strong>{presentationMode === "compact" ? "Compact groups" : "Individual cards"}</strong>
              </div>
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

            <section className="ai-activity-timeline" aria-labelledby="ai-activity-history-title">
              <div className="ai-activity-timeline__heading">
                <div>
                  <span className="eyebrow">Human-reviewed local AI activity</span>
                  <h2 id="ai-activity-history-title">AI-assisted change timeline</h2>
                </div>
                <p>
                  Records Apply or Reject decisions. Accepted activity links to the next
                  named version saved for this chart.
                </p>
              </div>
              {aiActivities.length ? (
                <ol>
                  {aiActivities.map((activity) => (
                    <li key={activity.id} className={`ai-activity-event is-${activity.status}`}>
                      <span className="ai-activity-event__marker" aria-hidden="true">
                        {activity.status === "accepted" ? <Check size={15} weight="bold" /> : <X size={15} weight="bold" />}
                      </span>
                      <div>
                        <div className="ai-activity-event__meta">
                          <strong>{activity.status === "accepted" ? "Applied" : "Rejected"}</strong>
                          <time dateTime={activity.createdAt}>
                            {new Date(activity.createdAt).toLocaleString()}
                          </time>
                        </div>
                        <p>{activity.summary}</p>
                        <span className="ai-activity-event__version">
                          {activity.versionNumber
                            ? `Included in version ${activity.versionNumber}: ${activity.versionLabel}`
                            : activity.status === "accepted"
                              ? "Awaiting the next named version"
                              : "Saved chart was not changed"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="history-empty">
                  No AI-assisted proposals have been applied or rejected for this chart.
                </div>
              )}
            </section>
          </section>
        ) : workspaceView === "ai" ? (
          <section className="ai-control-panel" aria-labelledby="ai-control-title">
            <div className="ai-control-heading">
              <div>
                <span className="eyebrow">Local MCP governance</span>
                <h1 id="ai-control-title">Local AI control center</h1>
                <p>
                  Pause tool access, limit complete chart reads and writes to selected
                  charts, and review the bounded local access receipt. Prompts are not stored.
                </p>
              </div>
              <button
                type="button"
                className={mcpControl?.paused ? "button button--primary" : "button button--danger"}
                onClick={() => void updateMcpControl({ paused: !mcpControl?.paused })}
                disabled={mcpControlBusy}
              >
                <Robot size={17} aria-hidden="true" />
                {mcpControl?.paused ? "Resume local AI access" : "Pause local AI access"}
              </button>
            </div>

            <div className="ai-control-metrics">
              <div>
                <span>Access state</span>
                <strong>{mcpControl?.paused ? "Paused" : "Available"}</strong>
              </div>
              <div>
                <span>Chart scope</span>
                <strong>{mcpControl?.chartScope === "selected" ? "Selected charts" : "All on request"}</strong>
              </div>
              <div>
                <span>Allowed charts</span>
                <strong>{mcpControl?.chartScope === "selected" ? mcpControl.allowedChartIds.length : charts.length}</strong>
              </div>
              <div>
                <span>Session receipts</span>
                <strong>{mcpControl?.events.length ?? 0}</strong>
              </div>
            </div>

            <div className="ai-control-layout">
              <fieldset className="ai-control-scope">
                <legend>Chart access for this running app session</legend>
                <label>
                  <input
                    type="radio"
                    name="mcp-chart-scope"
                    checked={(mcpControl?.chartScope ?? "all") === "all"}
                    onChange={() => void updateMcpControl({ chartScope: "all" })}
                  />
                  <span>
                    <strong>All charts when explicitly requested</strong>
                    <small>Chart contents still enter the AI conversation only when a read tool is called.</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="mcp-chart-scope"
                    checked={mcpControl?.chartScope === "selected"}
                    onChange={() => void updateMcpControl({ chartScope: "selected" })}
                  />
                  <span>
                    <strong>Selected charts only</strong>
                    <small>Other complete chart reads and chart-specific writes are blocked locally.</small>
                  </span>
                </label>
                {mcpControl?.chartScope === "selected" ? (
                  <div className="ai-control-chart-list">
                    {charts.map((chart) => (
                      <label key={chart.id}>
                        <input
                          type="checkbox"
                          checked={mcpControl.allowedChartIds.includes(chart.id)}
                          onChange={(event) => {
                            const allowedChartIds = event.target.checked
                              ? [...mcpControl.allowedChartIds, chart.id]
                              : mcpControl.allowedChartIds.filter((id) => id !== chart.id);
                            void updateMcpControl({ allowedChartIds });
                          }}
                        />
                        <span>{chart.name}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </fieldset>

              <section className="ai-control-receipts" aria-labelledby="ai-control-receipts-title">
                <div>
                  <div>
                    <span className="eyebrow">This app session</span>
                    <h2 id="ai-control-receipts-title">MCP access receipts</h2>
                  </div>
                  <div className="ai-control-receipt-actions">
                    <button type="button" className="button button--secondary" onClick={() => void loadMcpControl()}>
                      <ArrowClockwise size={16} aria-hidden="true" />Refresh
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      disabled={!mcpControl?.events.length}
                      onClick={async () => {
                        const response = await fetch("/api/mcp-control", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ action: "clear_events" }),
                        });
                        if (response.ok) {
                          const data = (await response.json()) as McpControlResponse;
                          setMcpControl(data.control);
                        }
                      }}
                    >
                      Clear receipts
                    </button>
                  </div>
                </div>
                {mcpControl?.events.length ? (
                  <div className="data-table-wrap">
                    <table>
                      <thead>
                        <tr><th scope="col">Tool</th><th scope="col">Mode</th><th scope="col">Chart</th><th scope="col">Result</th><th scope="col">Time</th></tr>
                      </thead>
                      <tbody>
                        {mcpControl.events.map((event) => (
                          <tr key={event.id}>
                            <th scope="row"><code>{event.toolName}</code></th>
                            <td>{event.mode}</td>
                            <td>{charts.find((chart) => chart.id === event.chartId)?.name ?? event.chartId ?? "Library"}</td>
                            <td>{event.allowed ? "Allowed" : "Blocked"}</td>
                            <td>{new Date(event.createdAt).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="history-empty">No MCP tools have requested access during this app session.</div>
                )}
              </section>
            </div>
          </section>
        ) : (
          <section
            className={workspaceView === "backups" ? "backup-panel" : "sources-panel"}
            aria-labelledby={workspaceView === "backups" ? "backup-title" : "sources-title"}
          >
            {workspaceView === "sources" ? (
              <>
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

            <section className="source-intake-card" aria-labelledby="source-intake-title">
              <div className="source-intake-card__heading">
                <div>
                  <span className="eyebrow">Local evidence first</span>
                  <h2 id="source-intake-title">Source intake bundles</h2>
                  <p>
                    Retain unchanged originals locally before normalization. ChatGPT receives
                    a file only when you separately attach that cleared file to its conversation;
                    MCP sees intake names, checksums, and file metadata—not file bytes.
                  </p>
                </div>
                <span>{importIntakes.filter((intake) => intake.status === "pending").length} pending</span>
              </div>
              <div className="source-intake-create">
                <label className="field-stack">
                  <span>Intake name</span>
                  <input
                    value={intakeName}
                    onChange={(event) => setIntakeName(event.target.value)}
                    placeholder="Example: Communications Division legacy sources"
                  />
                </label>
                <label className="evidence-picker">
                  <FilePpt size={22} aria-hidden="true" />
                  <span>
                    <strong>{intakeFiles.length ? `${intakeFiles.length} original file${intakeFiles.length === 1 ? "" : "s"}` : "Choose original source files"}</strong>
                    <small>{intakeFiles.length ? intakeFiles.map((file) => file.name).join(" · ") : "PowerPoint, Word, PDF, PNG, or JPEG · retained locally"}</small>
                  </span>
                  <input
                    key={intakeFiles.map((file) => file.name).join("|") || "empty-intake"}
                    type="file"
                    multiple
                    accept=".pptx,.docx,.pdf,.png,.jpg,.jpeg"
                    onChange={(event) => setIntakeFiles(Array.from(event.target.files ?? []).slice(0, 10))}
                  />
                </label>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={intakeBusy || !intakeName.trim() || !intakeFiles.length}
                  onClick={() => void createImportIntake()}
                >
                  <FileLock size={17} aria-hidden="true" />
                  {intakeBusy ? "Retaining sources…" : "Create local intake"}
                </button>
              </div>
              {importIntakes.length ? (
                <div className="source-intake-list">
                  {importIntakes.map((intake) => (
                    <article key={intake.id} className={intake.status === "pending" ? "is-pending" : "is-imported"}>
                      <div>
                        <strong>{intake.name}</strong>
                        <span>{intake.files.map((file) => file.fileName).join(" · ")}</span>
                      </div>
                      <span>{intake.status === "pending" ? "Ready for AI or manual import" : "Linked to imported chart"}</span>
                      {intake.status === "pending" ? (
                        <button
                          type="button"
                          className="icon-button icon-button--danger"
                          onClick={() => void discardImportIntake(intake)}
                          aria-label={`Discard source intake ${intake.name}`}
                        >
                          <Trash size={16} aria-hidden="true" />
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>

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
                <label className="field-stack">
                  <span>Retained source intake <small>(optional)</small></span>
                  <select
                    value={importIntakeId}
                    onChange={(event) => {
                      setImportIntakeId(event.target.value);
                      setImportPreview(null);
                      setImportReviewed(false);
                    }}
                  >
                    <option value="">No pre-staged intake</option>
                    {importIntakes
                      .filter((intake) => intake.status === "pending")
                      .map((intake) => (
                        <option key={intake.id} value={intake.id}>
                          {intake.name} · {intake.files.length} file{intake.files.length === 1 ? "" : "s"}
                        </option>
                      ))}
                  </select>
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

            <div className="governance-grid">
              <section className="quality-report" aria-labelledby="quality-report-title">
                <div className="quality-report__heading">
                  <div>
                    <span className="eyebrow">Import and maintenance audit</span>
                    <h2 id="quality-report-title">Chart quality report</h2>
                  </div>
                  <strong>{activeQualityReport?.score ?? 0}/100</strong>
                </div>
                {activeChart && activeQualityReport ? (
                  <>
                    <p>
                      {activeChart.name}: {activeQualityReport.blockingCount} blocking and {activeQualityReport.warningCount} review finding{activeQualityReport.warningCount === 1 ? "" : "s"}.
                    </p>
                    {activeQualityReport.findings.length ? (
                      <ul>
                        {activeQualityReport.findings.slice(0, 12).map((finding, index) => (
                          <li key={`${finding.code}-${index}`} className={`finding--${finding.severity}`}>
                            <WarningDiamond size={16} aria-hidden="true" />
                            <span><strong>{finding.code}</strong>{finding.message}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="quality-report__clear"><ShieldCheck size={20} aria-hidden="true" />No additional quality warnings found.</div>
                    )}
                  </>
                ) : (
                  <div className="history-empty">Open a chart to run its local quality audit.</div>
                )}
              </section>

              <section className="chart-compare" aria-labelledby="chart-compare-title">
                <div>
                  <span className="eyebrow">Reviewable chart-to-chart merge</span>
                  <h2 id="chart-compare-title">Compare and propose merge</h2>
                  <p>Use one chart as the proposed structure for another. The target remains unchanged until you apply the normal Before/After proposal.</p>
                </div>
                <div className="chart-compare__selectors">
                  <label className="field-stack">
                    <span>Source chart</span>
                    <select value={effectiveComparisonSourceId} onChange={(event) => setComparisonSourceId(event.target.value)}>
                      <option value="">Choose source</option>
                      {charts.map((chart) => <option key={chart.id} value={chart.id}>{chart.name}</option>)}
                    </select>
                  </label>
                  <label className="field-stack">
                    <span>Target chart</span>
                    <select value={effectiveComparisonTargetId} onChange={(event) => setComparisonTargetId(event.target.value)}>
                      <option value="">Choose target</option>
                      {charts.map((chart) => <option key={chart.id} value={chart.id}>{chart.name}</option>)}
                    </select>
                  </label>
                </div>
                {effectiveComparisonSourceId && effectiveComparisonSourceId === effectiveComparisonTargetId ? (
                  <div className="publication-warning" role="status">Choose two different charts.</div>
                ) : chartComparison ? (
                  <div className="chart-compare__summary">
                    <span><strong>{chartComparison.addedNodeIds.length}</strong> units added</span>
                    <span><strong>{chartComparison.changedNodeIds.length}</strong> units changed</span>
                    <span><strong>{chartComparison.removedNodeIds.length}</strong> units removed</span>
                    <span><strong>{chartComparison.addedEdgeIds.length + chartComparison.changedEdgeIds.length + chartComparison.removedEdgeIds.length}</strong> relationships changed</span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="button button--primary button--full"
                  disabled={!chartComparison?.totalChanges || comparisonBusy || effectiveComparisonSourceId === effectiveComparisonTargetId}
                  onClick={() => void stageChartMerge()}
                >
                  <Columns size={17} aria-hidden="true" />
                  {comparisonBusy ? "Preparing comparison…" : "Stage merge for Apply/Reject review"}
                </button>
              </section>
            </div>
              </>
            ) : null}

            {workspaceView === "backups" ? (
              <>
                <div className="backup-heading">
                  <div>
                    <span className="eyebrow">Independent recovery workspace</span>
                    <h1 id="backup-title">Backup and restore</h1>
                    <p>
                      Create one recovery file for the entire chart library or only the charts
                      you choose. Encryption is optional and separate from source intake and publication.
                    </p>
                  </div>
                  <div className="backup-heading__summary">
                    <span>{charts.length} charts available</span>
                    <strong>Merge-only restore</strong>
                  </div>
                </div>

                <section className={`backup-health ${backupIsDue ? "is-due" : "is-current"}`} aria-labelledby="backup-health-title">
                  <div>
                    <span className="eyebrow">Local recovery readiness</span>
                    <h2 id="backup-health-title">Backup health</h2>
                    <p>
                      {backupHealth.lastBackupAt
                        ? `Last backup created ${new Date(backupHealth.lastBackupAt).toLocaleString()} with ${backupHealth.lastBackupChartCount} chart${backupHealth.lastBackupChartCount === 1 ? "" : "s"}.`
                        : "No backup has been recorded in this desktop profile yet."}
                    </p>
                  </div>
                  <div className="backup-health__status">
                    {backupIsDue ? <ShieldWarning size={24} aria-hidden="true" /> : <ShieldCheck size={24} aria-hidden="true" />}
                    <strong>{backupIsDue ? "Backup due" : "Backup current"}</strong>
                    <span>{backupAgeDays === null ? "Create the first recovery package" : `${backupAgeDays} day${backupAgeDays === 1 ? "" : "s"} since backup`}</span>
                  </div>
                  <dl>
                    <div><dt>Protection</dt><dd>{backupHealth.lastBackupAt ? (backupHealth.lastBackupEncrypted ? "Encrypted" : "Unencrypted") : "Not recorded"}</dd></div>
                    <div><dt>Last verified restore</dt><dd>{backupHealth.lastRestoreVerifiedAt ? new Date(backupHealth.lastRestoreVerifiedAt).toLocaleDateString() : "Not yet"}</dd></div>
                  </dl>
                  <label className="field-stack">
                    <span>Remind me after</span>
                    <select
                      value={backupHealth.reminderDays}
                      onChange={(event) =>
                        saveBackupHealth({
                          ...backupHealth,
                          reminderDays: Number(event.target.value) as BackupHealthState["reminderDays"],
                        })
                      }
                    >
                      <option value={7}>7 days</option>
                      <option value={14}>14 days</option>
                      <option value={30}>30 days</option>
                      <option value={90}>90 days</option>
                    </select>
                  </label>
                </section>

            <section className="backup-card" aria-labelledby="backup-package-title">
              <div className="backup-card__heading">
                <FileLock size={26} aria-hidden="true" />
                <div>
                  <span className="eyebrow">Portable recovery copy</span>
                  <h2 id="backup-package-title">Portable database backup</h2>
                  <p>Every package is one file containing the chosen charts and their related application data. Encryption is recommended but optional.</p>
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
                      <p>
                        {desktopStorage.backupIsCloudSynced
                          ? "Encrypted backups may be saved here. Unencrypted backups require a local folder."
                          : "Encrypted or explicitly confirmed unencrypted .orgchart-backup packages may be saved here."}
                      </p>
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
                <p><strong>Prototype boundary:</strong> authentication and production access controls are not connected. Use only synthetic or approved sanitized data. Encrypted passphrases cannot be recovered; unencrypted backup contents are readable by anyone who obtains the file.</p>
              </div>

              <div className="backup-actions-grid">
                <div className="backup-action">
                  <div><span>01</span><h3>Create backup</h3></div>
                  <p>Choose the contents and whether the single backup file should be encrypted.</p>
                  <fieldset className="backup-scope">
                    <legend>Backup contents</legend>
                    <div className="backup-scope__options">
                      <label className={backupScope === "all" ? "is-selected" : ""}>
                        <input
                          type="radio"
                          name="backup-scope"
                          checked={backupScope === "all"}
                          onChange={() => chooseBackupScope("all")}
                        />
                        <span>
                          <strong>Entire library</strong>
                          <small>All charts, layouts, versions, sources, and retained files</small>
                        </span>
                      </label>
                      <label className={backupScope === "selected" ? "is-selected" : ""}>
                        <input
                          type="radio"
                          name="backup-scope"
                          checked={backupScope === "selected"}
                          onChange={() => chooseBackupScope("selected")}
                        />
                        <span>
                          <strong>Selected charts</strong>
                          <small>Only chosen charts and their related application data</small>
                        </span>
                      </label>
                    </div>
                    {backupScope === "selected" ? (
                      <div className="backup-chart-selection">
                        <div className="backup-chart-selection__heading">
                          <span>{selectedBackupCharts.length} of {charts.length} charts selected</span>
                          <div>
                            <button
                              type="button"
                              onClick={() => setBackupSelectedChartIds(new Set(charts.map((chart) => chart.id)))}
                              disabled={!charts.length || selectedBackupCharts.length === charts.length}
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() => setBackupSelectedChartIds(new Set())}
                              disabled={!selectedBackupCharts.length}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="backup-chart-selection__list" role="group" aria-label="Charts included in backup">
                          {charts.map((chart) => (
                            <label key={chart.id}>
                              <input
                                type="checkbox"
                                checked={backupSelectedChartIds.has(chart.id)}
                                onChange={(event) => setBackupChartSelected(chart.id, event.target.checked)}
                              />
                              <span>
                                <strong>{chart.name}</strong>
                                <small>{chart.nodes.length} units · {chart.sources.length} sources · {chart.status.replace("_", " ")}</small>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </fieldset>
                  <fieldset className="backup-scope backup-protection">
                    <legend>File protection</legend>
                    <div className="backup-scope__options">
                      <label className={backupProtection === "encrypted" ? "is-selected" : ""}>
                        <input
                          type="radio"
                          name="backup-protection"
                          checked={backupProtection === "encrypted"}
                          onChange={() => {
                            setBackupProtection("encrypted");
                            setUnencryptedBackupConfirmed(false);
                          }}
                        />
                        <span>
                          <strong>Encrypted (recommended)</strong>
                          <small>Requires a passphrase to read or restore the backup</small>
                        </span>
                      </label>
                      <label className={backupProtection === "unencrypted" ? "is-selected" : ""}>
                        <input
                          type="radio"
                          name="backup-protection"
                          checked={backupProtection === "unencrypted"}
                          onChange={() => {
                            setBackupProtection("unencrypted");
                            setUnencryptedBackupConfirmed(false);
                          }}
                        />
                        <span>
                          <strong>Unencrypted</strong>
                          <small>Readable JSON package with no passphrase</small>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                  {backupProtection === "encrypted" ? (
                    <>
                      <div className="backup-encryption-note">
                        <FileLock size={16} aria-hidden="true" />
                        <span>AES-256-GCM encryption happens on this device before the file is saved.</span>
                      </div>
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
                    </>
                  ) : (
                    <div className="backup-unencrypted-warning">
                      <ShieldWarning size={18} aria-hidden="true" />
                      <div>
                        <strong>No encryption will be applied</strong>
                        <p>Anyone with this file can read its chart data, source records, and retained source files.</p>
                        {unencryptedCloudBackupBlocked ? (
                          <p className="backup-unencrypted-warning__blocked">
                            The configured backup folder is cloud-synced. Choose a local folder or turn encryption on.
                          </p>
                        ) : null}
                        <label>
                          <input
                            type="checkbox"
                            checked={unencryptedBackupConfirmed}
                            onChange={(event) => setUnencryptedBackupConfirmed(event.target.checked)}
                          />
                          <span>I understand this backup will not be protected by a passphrase.</span>
                        </label>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="button button--primary button--full"
                    disabled={
                      backupBusy !== null ||
                      !charts.length ||
                      (backupScope === "selected" && !selectedBackupCharts.length) ||
                      (backupProtection === "unencrypted" &&
                        (!unencryptedBackupConfirmed || unencryptedCloudBackupBlocked))
                    }
                    onClick={() => void createBackup()}
                  >
                    {backupProtection === "encrypted" ? (
                      <FileLock size={17} aria-hidden="true" />
                    ) : (
                      <DownloadSimple size={17} aria-hidden="true" />
                    )}
                    {backupBusy === "export"
                      ? backupProtection === "encrypted"
                        ? "Encrypting backup…"
                        : "Creating backup…"
                      : unencryptedCloudBackupBlocked
                        ? "Choose a local backup folder"
                      : desktopStorage?.backupDirectory
                        ? backupProtection === "encrypted"
                          ? "Encrypt and save to backup folder"
                          : "Save unencrypted backup"
                        : backupProtection === "encrypted"
                          ? "Encrypt and download"
                          : "Download unencrypted backup"}
                  </button>
                </div>

                <div className="backup-action">
                  <div><span>02</span><h3>Restore without overwriting</h3></div>
                  <p>Restore is merge-only. Every recovered chart receives a new ID and returns as a draft.</p>
                  <label className="backup-file-picker">
                    <UploadSimple size={22} aria-hidden="true" />
                    <span>{backupFile?.name ?? "Choose backup file"}</span>
                    <input
                      key={backupFile?.name ?? "empty-backup"}
                      type="file"
                      accept=".orgchart-backup,application/json"
                      onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label className="field-stack">
                    <span>Passphrase <small>(encrypted backups only)</small></span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={restorePassphrase}
                      onChange={(event) => setRestorePassphrase(event.target.value)}
                      placeholder="Leave blank for unencrypted backups"
                    />
                  </label>
                  <button
                    type="button"
                    className="button button--secondary button--full"
                    disabled={backupBusy !== null || !backupFile}
                    onClick={() => void restoreBackup()}
                  >
                    <UploadSimple size={17} aria-hidden="true" />
                    {backupBusy === "restore" ? "Validating restore…" : "Restore copies"}
                  </button>
                </div>
              </div>

              {backupMessage ? <div className="backup-message" role="status">{backupMessage}</div> : null}
            </section>
              </>
            ) : null}

            {workspaceView === "sources" ? (
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
            ) : null}
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
                <span>Compact presentation</span>
                <select
                  name="compactDisplay"
                  defaultValue={selectedNode.data.unit.compactDisplay ?? "auto"}
                >
                  <option value="auto">Automatic by hierarchy level</option>
                  <option value="list">List inside parent group</option>
                  <option value="card">Keep as a separate card</option>
                  <option value="sidecar">Leadership sidecar card</option>
                </select>
                <small>
                  List applies only to terminal records. Sidecar applies to a terminal record directly below the chart root.
                </small>
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
                <span>Organization state</span>
                <select
                  name="planningState"
                  defaultValue={selectedNode.data.unit.planningState ?? "current"}
                >
                  <option value="current">Current organization</option>
                  <option value="planned">Planned or future state</option>
                </select>
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
              <label className="editor-field">
                <span>Source locator</span>
                <input
                  name="sourceLocator"
                  defaultValue={selectedNode.data.unit.sourceLocator ?? ""}
                  placeholder="Slide, page, worksheet, or row"
                />
              </label>
              <label className="editor-field">
                <span>Source certainty</span>
                <select
                  name="sourceCertainty"
                  defaultValue={selectedNode.data.unit.sourceCertainty ?? "confirmed"}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="inferred">Inferred</option>
                  <option value="needs_review">Needs review</option>
                </select>
              </label>
              <label className="editor-field">
                <span>Review note</span>
                <textarea
                  name="reviewNote"
                  rows={2}
                  defaultValue={selectedNode.data.unit.reviewNote ?? ""}
                  placeholder="Record the unresolved source question or reason for an inference"
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

      {pendingAiProposal ? (
        <div className="ai-review-scrim">
          <aside
            className="ai-review-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-review-title"
          >
            <header className="ai-review-panel__header">
              <div>
                <span className="eyebrow">AI proposal · your decision required</span>
                <h2 id="ai-review-title">Review before applying</h2>
                <p>
                  <strong>Nothing has changed yet.</strong> The canvas is showing a temporary
                  preview; the saved chart remains unchanged until you apply this proposal.
                </p>
              </div>
              <span className="ai-review-panel__unsaved">Not applied</span>
            </header>

            <div className="ai-review-summary" aria-label="Proposed change summary">
              <div><strong>{pendingAiProposal.summary.added}</strong><span>Added</span></div>
              <div><strong>{pendingAiProposal.summary.changed}</strong><span>Changed</span></div>
              <div><strong>{pendingAiProposal.summary.removed}</strong><span>Removed</span></div>
              <p>{pendingAiProposal.summary.text}</p>
            </div>

            <section className="ai-review-purpose" aria-labelledby="ai-review-purpose-title">
              <h3 id="ai-review-purpose-title">Why this change was proposed</h3>
              <p>
                {pendingAiProposal.changeSummary ??
                  "No reason was provided with this proposal. Review the field changes carefully before applying it."}
              </p>
            </section>

            <div className="ai-review-filters" aria-label="Filter proposed changes">
              {([
                ["all", "All"],
                ["chart", "Chart"],
                ["unit", "Cards"],
                ["relationship", "Lines"],
                ["layout", "Layout"],
              ] as const).map(([category, label]) => (
                <button
                  key={category}
                  type="button"
                  className={aiReviewCategory === category ? "is-active" : ""}
                  onClick={() => setAiReviewCategory(category)}
                  aria-pressed={aiReviewCategory === category}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="ai-review-change-list" aria-live="polite">
              {visibleAiChanges.map((change) => (
                <article key={change.id} className={`ai-review-change ai-review-change--${change.kind}`}>
                  <div className="ai-review-change__heading">
                    <span>{change.kind}</span>
                    <strong>{change.entityLabel}</strong>
                  </div>
                  <h3>{change.fieldLabel}</h3>
                  <dl>
                    <div>
                      <dt>Before</dt>
                      <dd>{change.before ?? "Not present"}</dd>
                    </div>
                    <div>
                      <dt>After</dt>
                      <dd>{change.after ?? "Removed"}</dd>
                    </div>
                  </dl>
                </article>
              ))}
              {!visibleAiChanges.length ? (
                <p className="ai-review-change-list__empty">No changes in this category.</p>
              ) : null}
            </div>

            <footer className="ai-review-panel__footer">
              <div className="ai-review-next-step">
                <strong>Your next step</strong>
                <p>
                  Review every Before and After item. Apply the change to update the saved
                  working chart, choose Review later to keep it pending, or reject it to leave
                  the chart unchanged.
                </p>
                <small>
                  This proposal is available until {new Intl.DateTimeFormat(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(pendingAiProposal.expiresAt))}.
                </small>
              </div>
              {aiProposalError ? (
                <p className="ai-review-panel__error" role="alert">
                  {aiProposalError}
                </p>
              ) : null}
              <div>
                <button
                  type="button"
                  className="button button--secondary"
                  data-ai-proposal-action="defer"
                  onClick={deferAiProposal}
                  disabled={aiProposalBusy !== null}
                >
                  Review later
                </button>
                <button
                  type="button"
                  className="button button--secondary ai-review-reject"
                  data-ai-proposal-action="reject"
                  onClick={() => void resolveAiProposal("reject")}
                  disabled={aiProposalBusy !== null}
                  aria-busy={aiProposalBusy === "reject"}
                >
                  {aiProposalBusy === "reject" ? "Rejecting…" : "Reject and leave unchanged"}
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  data-ai-proposal-action="accept"
                  onClick={() => void resolveAiProposal("accept")}
                  disabled={aiProposalBusy !== null}
                  aria-busy={aiProposalBusy === "accept"}
                >
                  <Check size={17} weight="bold" aria-hidden="true" />
                  {aiProposalBusy === "accept" ? "Applying…" : "Apply change to chart"}
                </button>
              </div>
            </footer>
          </aside>
        </div>
      ) : null}

      {pendingAiImportProposal ? (
        <div className="ai-review-scrim">
          <aside
            className="ai-import-review-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-import-review-title"
          >
            <header className="ai-review-panel__header">
              <div>
                <span className="eyebrow">Local MCP · new chart review</span>
                <h2 id="ai-import-review-title">Review proposed chart import</h2>
                <p>
                  Validate the hierarchy, uncertainty labels, and retained evidence before
                  creating a new local chart. Nothing has been added to the library.
                </p>
              </div>
              <span className="ai-review-panel__unsaved">Not created</span>
            </header>

            <div className="ai-import-review-summary">
              <div><span>Proposed chart</span><strong>{pendingAiImportProposal.chartName}</strong></div>
              <div><span>Units</span><strong>{pendingAiImportProposal.proposed.nodes.length}</strong></div>
              <div><span>Relationships</span><strong>{pendingAiImportProposal.proposed.edges.length}</strong></div>
              <div><span>Quality</span><strong>{pendingAiImportProposal.quality.score}/100</strong></div>
            </div>

            <div className="ai-import-review-evidence">
              <div>
                <span>Source intake</span>
                <strong>{pendingAiImportProposal.intakeName ?? "No retained intake linked"}</strong>
              </div>
              <p>
                {pendingAiImportProposal.evidenceFileNames.length
                  ? pendingAiImportProposal.evidenceFileNames.join(" · ")
                  : "Only the normalized JSON or CSV will be retained unless you reject and link a source intake first."}
              </p>
            </div>

            <div className="ai-import-review-body">
              <section aria-labelledby="ai-import-units-title">
                <h3 id="ai-import-units-title">Proposed hierarchy</h3>
                <div className="data-table-wrap">
                  <table>
                    <thead>
                      <tr><th scope="col">Unit</th><th scope="col">Parent</th><th scope="col">State</th><th scope="col">Source</th></tr>
                    </thead>
                    <tbody>
                      {pendingAiImportProposal.proposed.nodes.slice(0, 40).map((node) => {
                        const parentEdge = pendingAiImportProposal.proposed.edges.find((edge) => edge.target === node.id);
                        const parent = pendingAiImportProposal.proposed.nodes.find((candidate) => candidate.id === parentEdge?.source);
                        return (
                          <tr key={node.id}>
                            <th scope="row">{node.data.unit.name}</th>
                            <td>{parent?.data.unit.shortName ?? "Root"}</td>
                            <td>{planningStateForNode(node) === "planned" ? `Planned · ${node.data.unit.effectiveDate}` : "Current"}</td>
                            <td>
                              {node.data.unit.sourceCertainty === "needs_review" ? "Needs review" : node.data.unit.sourceCertainty === "inferred" ? "Inferred" : "Confirmed"}
                              {node.data.unit.sourceLocator ? ` · ${node.data.unit.sourceLocator}` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {pendingAiImportProposal.proposed.nodes.length > 40 ? (
                  <p>{pendingAiImportProposal.proposed.nodes.length - 40} additional units passed the same structural validation.</p>
                ) : null}
              </section>
              <section aria-labelledby="ai-import-findings-title">
                <h3 id="ai-import-findings-title">Validation and quality findings</h3>
                {pendingAiImportProposal.findings.length ? (
                  <ul className="ai-import-review-findings">
                    {pendingAiImportProposal.findings.map((finding, index) => (
                      <li key={`${finding.code}-${index}`} className={`finding--${finding.severity}`}>
                        <WarningDiamond size={16} aria-hidden="true" />
                        <span><strong>{finding.code}</strong>{finding.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="quality-report__clear"><ShieldCheck size={20} aria-hidden="true" />No validation or quality warnings.</div>
                )}
              </section>
            </div>

            <footer className="ai-review-panel__footer">
              <p>
                Creating the chart writes this reviewed structure to the local database as a
                new draft. Existing charts are not overwritten.
              </p>
              {aiImportError ? <p className="ai-review-panel__error" role="alert">{aiImportError}</p> : null}
              <div>
                <button
                  type="button"
                  className="button button--secondary ai-review-reject"
                  data-ai-import-action="reject"
                  onClick={() => void resolveAiImportProposal("reject")}
                  disabled={aiImportBusy !== null}
                  aria-busy={aiImportBusy === "reject"}
                >
                  {aiImportBusy === "reject" ? "Rejecting…" : "Reject import"}
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  data-ai-import-action="accept"
                  onClick={() => void resolveAiImportProposal("accept")}
                  disabled={aiImportBusy !== null}
                  aria-busy={aiImportBusy === "accept"}
                >
                  <Check size={17} weight="bold" aria-hidden="true" />
                  {aiImportBusy === "accept" ? "Creating chart…" : "Create reviewed chart"}
                </button>
              </div>
            </footer>
          </aside>
        </div>
      ) : null}

      {currentTourStep ? (
        <div className="onboarding-tour">
          {tourGeometry.target ? (
            <div
              className="onboarding-tour__spotlight"
              aria-hidden="true"
              style={{
                top: tourGeometry.target.top,
                left: tourGeometry.target.left,
                width: tourGeometry.target.width,
                height: tourGeometry.target.height,
              }}
            />
          ) : (
            <div className="onboarding-tour__shade" aria-hidden="true" />
          )}
          <section
            ref={onboardingDialogRef}
            className="onboarding-tour__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-tour-title"
            tabIndex={-1}
            style={{ top: tourGeometry.panel.top, left: tourGeometry.panel.left }}
          >
            <header>
              <span className="eyebrow">{currentTourStep.eyebrow}</span>
              <span className="onboarding-tour__progress">
                {(onboardingStep ?? 0) + 1} of {ONBOARDING_TOUR_STEPS.length}
              </span>
            </header>
            <h2 id="onboarding-tour-title">{currentTourStep.title}</h2>
            <p>{currentTourStep.body}</p>
            <div className="onboarding-tour__steps" aria-hidden="true">
              {ONBOARDING_TOUR_STEPS.map((step, index) => (
                <span
                  key={step.title}
                  className={index === onboardingStep ? "is-active" : ""}
                />
              ))}
            </div>
            <footer>
              <button
                type="button"
                className="onboarding-tour__skip"
                onClick={() =>
                  finishOnboardingTour("Tour closed. Choose Tips & tour whenever you want to replay it.")
                }
              >
                Skip tour
              </button>
              <span>
                {(onboardingStep ?? 0) > 0 ? (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() =>
                      setOnboardingStep((current) =>
                        current === null ? null : Math.max(current - 1, 0),
                      )
                    }
                  >
                    <CaretLeft size={16} aria-hidden="true" />
                    Back
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => {
                    if ((onboardingStep ?? 0) === ONBOARDING_TOUR_STEPS.length - 1) {
                      finishOnboardingTour(
                        "Tour complete. Choose Tips & tour whenever you want to replay it.",
                      );
                    } else {
                      setOnboardingStep((current) =>
                        current === null
                          ? null
                          : Math.min(current + 1, ONBOARDING_TOUR_STEPS.length - 1),
                      );
                    }
                  }}
                >
                  {(onboardingStep ?? 0) === ONBOARDING_TOUR_STEPS.length - 1
                    ? "Finish tour"
                    : "Next tip"}
                  {(onboardingStep ?? 0) === ONBOARDING_TOUR_STEPS.length - 1 ? null : (
                    <CaretRight size={16} aria-hidden="true" />
                  )}
                </button>
              </span>
            </footer>
          </section>
        </div>
      ) : null}

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
