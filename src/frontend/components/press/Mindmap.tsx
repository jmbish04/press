/**
 * @fileoverview Custom lightweight mind map tree renderer.
 *
 * Horizontal tree layout with bezier curve SVG edges, collapsible nodes,
 * zoom controls, and OKLCH hue-based coloring. NOT mind-elixir — this is
 * a custom implementation from the v2 prototype.
 */
import React, { useState, useMemo } from "react";
import { Icon } from "./PressIcon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MindmapNode {
  label: string;
  hue?: number;
  children?: MindmapNode[];
}

interface LayoutNode {
  id: string;
  label: string;
  depth: number;
  x: number;
  y: number;
  hasChildren: boolean;
  collapsed: boolean;
  parent: string | null;
}

interface LayoutEdge {
  from: LayoutNode;
  to: LayoutNode;
}

// ---------------------------------------------------------------------------
// Layout algorithm
// ---------------------------------------------------------------------------

const COL = 230;
const ROW = 50;

function buildLayout(root: MindmapNode, collapsed: Set<string>) {
  let leaf = 0;
  let maxDepth = 0;
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  function walk(
    n: MindmapNode,
    depth: number,
    path: string,
    parent: string | null,
  ): LayoutNode {
    const id = path;
    maxDepth = Math.max(maxDepth, depth);
    const isCollapsed = collapsed.has(id);
    const kids =
      n.children && n.children.length && !isCollapsed
        ? n.children.map((c, i) => walk(c, depth + 1, `${path}.${i}`, id))
        : [];

    let y: number;
    if (kids.length) {
      y = (kids[0].y + kids[kids.length - 1].y) / 2;
    } else {
      y = leaf * ROW;
      leaf++;
    }

    const node: LayoutNode = {
      id,
      label: n.label,
      depth,
      x: depth * COL,
      y,
      hasChildren: !!(n.children && n.children.length),
      collapsed: isCollapsed,
      parent,
    };
    nodes.push(node);
    kids.forEach((k) => edges.push({ from: node, to: k }));
    return node;
  }

  walk(root, 0, "0", null);

  return {
    nodes,
    edges,
    width: (maxDepth + 1) * COL,
    height: Math.max(leaf, 1) * ROW + 20,
  };
}

// ---------------------------------------------------------------------------
// Branch templates (used to generate mindmaps for articles by category)
// ---------------------------------------------------------------------------

export const BRANCH_TEMPLATES: Record<string, [string, string[]][]> = {
  ai: [
    ["Core thesis", ["What's actually new", "Why now"]],
    ["Mechanics", ["How it works", "Key constraints"]],
    ["Implications", ["For builders", "For incumbents"]],
    ["Open questions", ["Unknowns", "What to watch"]],
  ],
  hardware: [
    ["The verdict", ["Who it's for", "Trade-offs"]],
    ["Specs that matter", ["Performance", "Thermals & noise"]],
    ["Value", ["Price tier", "Alternatives"]],
    ["Buy or wait", ["Now", "Next cycle"]],
  ],
  career: [
    ["The framework", ["Step by step", "Common mistakes"]],
    ["What to say", ["Strong phrasing", "What to avoid"]],
    ["Preparation", ["Before", "On the day"]],
    ["Follow-through", ["After", "Long game"]],
  ],
  startups: [
    ["The claim", ["Thesis", "Evidence"]],
    ["Market shape", ["Demand", "Supply"]],
    ["Strategy", ["Moats", "Risks"]],
    ["So what", ["For founders", "For investors"]],
  ],
  science: [
    ["The finding", ["What changed", "Why it matters"]],
    ["The method", ["Approach", "Limits"]],
    ["Context", ["Prior work", "Debate"]],
    ["Next", ["Implications", "Unknowns"]],
  ],
  default: [
    ["Key points", ["Main argument", "Supporting evidence"]],
    ["Analysis", ["Strengths", "Weaknesses"]],
    ["Context", ["Background", "Related work"]],
    ["Takeaways", ["What to do", "What to watch"]],
  ],
};

/** Generate a mindmap tree for an article using category-based templates. */
export function mindmapForArticle(
  title: string,
  category?: string,
): MindmapNode {
  const tpl = BRANCH_TEMPLATES[category ?? ""] ?? BRANCH_TEMPLATES.default;
  return {
    label: title,
    hue: 35,
    children: tpl.map(([branch, leaves]) => ({
      label: branch,
      children: leaves.map((l) => ({ label: l })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Mindmap component
// ---------------------------------------------------------------------------

interface MindmapProps {
  tree: MindmapNode;
  accentHue?: number;
}

export default function Mindmap({ tree, accentHue }: MindmapProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const hue = accentHue ?? tree.hue ?? 35;

  const { nodes, edges, width, height } = useMemo(
    () => buildLayout(tree, collapsed),
    [tree, collapsed],
  );

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mm-wrap">
      <div className="mm-controls">
        <button
          className="icon-btn"
          onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
          title="Zoom in"
        >
          <Icon name="plus" size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
          title="Zoom out"
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>−</span>
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            setZoom(1);
            setCollapsed(new Set());
          }}
          title="Reset"
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>

      <div
        style={{
          overflow: "auto",
          width: "100%",
          height: "100%",
          padding: 20,
        }}
      >
        <div
          style={{
            width,
            height,
            transform: `scale(${zoom})`,
            transformOrigin: "0 0",
            position: "relative",
          }}
        >
          {/* SVG edges */}
          <svg
            style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
            width={width}
            height={height}
          >
            {edges.map((e, i) => {
              const x1 = e.from.x + 188;
              const y1 = e.from.y + 17;
              const x2 = e.to.x;
              const y2 = e.to.y + 17;
              const mx = (x1 + x2) / 2;
              return (
                <path
                  key={i}
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={`oklch(0.6 0.1 ${hue} / ${e.to.depth === 1 ? 0.5 : 0.3})`}
                  strokeWidth={e.to.depth === 1 ? 2 : 1.5}
                />
              );
            })}
          </svg>

          {/* DOM nodes */}
          {nodes.map((n) => (
            <div
              key={n.id}
              style={{
                position: "absolute",
                left: n.x,
                top: n.y,
                maxWidth: 200,
                padding: "6px 10px",
                borderRadius: "var(--radius-md)",
                fontSize: n.depth === 0 ? 14 : 12.5,
                fontWeight: n.depth === 0 ? 700 : n.depth === 1 ? 550 : 400,
                background:
                  n.depth === 0
                    ? `oklch(0.55 0.15 ${hue} / 22%)`
                    : n.depth === 1
                      ? `oklch(0.55 0.1 ${hue} / 14%)`
                      : "var(--surface)",
                border: `1px solid ${n.depth === 0 ? `oklch(0.55 0.15 ${hue} / 35%)` : "var(--border)"}`,
                color: n.depth === 0 ? `oklch(0.88 0.08 ${hue})` : "var(--foreground)",
                cursor: n.hasChildren ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                zIndex: n.depth === 0 ? 2 : 1,
              }}
              onClick={() => n.hasChildren && toggle(n.id)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {n.label}
              </span>
              {n.hasChildren && (
                <span style={{ flexShrink: 0, opacity: 0.6 }}>
                  {n.collapsed ? (
                    <Icon name="plus" size={11} />
                  ) : (
                    <Icon
                      name="x"
                      size={10}
                      style={{ transform: "rotate(45deg)" }}
                    />
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniMindmap — thumbnail preview for Studio cards
// ---------------------------------------------------------------------------

interface MiniMindmapProps {
  tree: MindmapNode;
  hue?: number;
}

export function MiniMindmap({ tree, hue = 35 }: MiniMindmapProps) {
  const emptySet = useMemo(() => new Set<string>(), []);
  const { nodes, edges, width, height } = useMemo(
    () => buildLayout(tree, emptySet),
    [tree, emptySet],
  );
  const scale = Math.min(1, 240 / width, 120 / height);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      style={{ opacity: 0.7 }}
    >
      {edges.map((e, i) => {
        const x1 = e.from.x + 90;
        const y1 = e.from.y + 10;
        const x2 = e.to.x;
        const y2 = e.to.y + 10;
        const mx = (x1 + x2) / 2;
        return (
          <path
            key={i}
            d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
            fill="none"
            stroke={`oklch(0.6 0.1 ${hue} / 0.4)`}
            strokeWidth={1}
          />
        );
      })}
      {nodes.map((n) => (
        <rect
          key={n.id}
          x={n.x}
          y={n.y}
          width={n.depth === 0 ? 90 : 60}
          height={16}
          rx={4}
          fill={
            n.depth === 0
              ? `oklch(0.55 0.15 ${hue} / 0.4)`
              : `oklch(0.5 0.05 ${hue} / 0.2)`
          }
        />
      ))}
    </svg>
  );
}
