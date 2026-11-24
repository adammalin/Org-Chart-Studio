"use client";

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";

const help: Record<string, string> = {
  "Chart library": "Browse charts as a flat list or organization tree. Search and filter to find an organization, then open its chart. Archived charts keep their data and history.",
  "Chart editor": "Select a card to update its name, person, role or status. Save organizational changes and wait for Saved. In the browser, save the full library file too.",
  "Review queue": "Check flagged details against the official source. Confirm matches, correct errors and leave unclear items unresolved. The badge counts items, not charts; clearing it does not mark charts Current.",
  "History / Timeline": "Look back at recorded people and roles, compare checkpoints, undo edits or restore an older version as a new Draft. Checkpoint dates show when data was saved, not when a role began. History stays inside the library.",
  "Monthly updates": "Start a batch before editing to preserve the previous state. Make and review changes, then complete the batch to save final checkpoints. Save the full library file afterward. Completion does not mark charts Current.",
  "Backup & restore": "Keep a complete copy of your library, sources and history. Open library continues an existing working file; Merge backup creates copies. A chart export is not a database backup.",
  "Publish & export": "Download the selected chart as SVG, PNG, PDF, editable PowerPoint or a table. Check the audience and output. This does not publish online or save the full library; public-safe filtering is not publication approval.",
  "Advanced tools": "Expand specialist tools for accessible tables, source imports and cross-chart consistency checks. These tools are available in Advanced mode; switching modes keeps your data.",
  "Accessible table": "Inspect the selected chart as searchable rows of organizations, people, roles and source details. Download the table for review; it does not contain the full database or history.",
  "Sources & imports": "Add source files or structured data and inspect extracted records before creating a chart. Imports create charts or copies. To change an existing chart, edit it or ask the assistant to update that chart.",
  "Consistency & priorities": "Compare related records across charts and prioritize source questions. Similar names can represent different groups or support assignments. Check the official sources before correcting a candidate.",
  "Browser AI control": "Connect your companion agent to this browser library. Choose its chart scope, manage source access or pause the connection. Review proposed changes before applying them, then save the full library file.",
  "Local AI control": "Connect your companion agent to this desktop database. Choose its chart scope, manage source access or pause the connection. Review proposed changes before applying them and keep a full backup.",
  "Tips & tour": "Open the guided tutorial for your current Simple or Advanced mode. Walk through editing, AI reviews, monthly updates, history, imports, exports and saving. You can reopen it whenever you need help.",
};

function helpPosition(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 24);
  return {
    left: Math.max(12, Math.min(rect.right + 8, window.innerWidth - width - 12)),
    top: Math.max(12, Math.min(rect.top, window.innerHeight - 220)),
    width,
  };
}

/** A portal keeps help clear of the scrolling sidebar and the compact bottom nav. */
export function SidebarHelpButton({ as: Tag = "button", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { as?: "button" | "summary" }) {
  const id = useId(), anchor = useRef<HTMLElement | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const label = props["aria-label"] ?? "", description = help[label];
  function cancelTimer() { clearTimeout(timer.current); }
  function close() { cancelTimer(); setPosition(null); }
  function show() {
    cancelTimer();
    if (!anchor.current || !description) return;
    setPosition(helpPosition(anchor.current));
  }
  function scheduleClose() {
    cancelTimer();
    if (document.activeElement !== anchor.current) timer.current = setTimeout(() => setPosition(null), 120);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!position) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setPosition(null); };
    const dismissMoved = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".sidebar-help")) return;
      // Keyboard focus can scroll a previously hidden sidebar item into view.
      if (anchor.current && document.activeElement === anchor.current) setPosition(helpPosition(anchor.current));
      else setPosition(null);
    };
    window.addEventListener("keydown", dismiss);
    window.addEventListener("resize", dismissMoved);
    window.addEventListener("scroll", dismissMoved, true);
    return () => {
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("resize", dismissMoved);
      window.removeEventListener("scroll", dismissMoved, true);
    };
  }, [position]);
  return <>
    <Tag {...props}
      aria-describedby={position ? [props["aria-describedby"], id].filter(Boolean).join(" ") : props["aria-describedby"]}
      onPointerEnter={event => { props.onPointerEnter?.(event); if (event.pointerType === "mouse") { anchor.current = event.currentTarget; cancelTimer(); timer.current = setTimeout(show, 400); } }}
      onPointerLeave={event => { props.onPointerLeave?.(event); scheduleClose(); }}
      onFocus={event => { props.onFocus?.(event); anchor.current = event.currentTarget; show(); }}
      onBlur={event => { props.onBlur?.(event); close(); }}
      onClick={event => { close(); props.onClick?.(event); }}
    >{children}</Tag>
    {position && createPortal(<div id={id} role="tooltip" className="sidebar-help" style={position}
      onPointerEnter={cancelTimer} onPointerLeave={scheduleClose}>
      <strong>{label}</strong><p>{description}</p>
    </div>, document.body)}
  </>;
}
