/**
 * @fileoverview GenerateModal — Cross-cutting artifact generation modal.
 *
 * Triggered from ArticleView, Notebook, or Studio to generate mind maps
 * or PWAs via the agent's spawn_artifact tool. Shows compose phase,
 * building progress, and completion with "Open in Studio" action.
 */
import React, { useState } from "react";
import { Icon } from "./PressIcon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArtifactKind = "mindmap" | "pwa";

interface GenerateModalProps {
  kind: ArtifactKind;
  scopeLabel: string;
  presetPrompt?: string;
  onClose: () => void;
  onDone: (artifact: GeneratedArtifact) => void;
}

export interface GeneratedArtifact {
  id: string;
  type: ArtifactKind;
  title: string;
  source: string;
  prompt: string;
}

// ---------------------------------------------------------------------------
// Build step definitions
// ---------------------------------------------------------------------------

const BUILD_STEPS: Record<ArtifactKind, string[]> = {
  mindmap: [
    "Reading sources",
    "Extracting key concepts",
    "Clustering into branches",
    "Rendering the mind map",
    "Saving to R2 · indexing D1",
  ],
  pwa: [
    "Planning components & routes",
    "Generating shadcn React UI",
    "Deploying to a dynamic worker",
    "Saving build to R2",
    "Indexing in D1",
  ],
};

const PWA_TEMPLATES = [
  "Flashcard study app",
  "Interactive checklist",
  "Comparison dashboard",
  "Step-by-step guide",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

let _artifactId = 5000;

export default function GenerateModal({
  kind,
  scopeLabel,
  presetPrompt = "",
  onClose,
  onDone,
}: GenerateModalProps) {
  const [prompt, setPrompt] = useState(presetPrompt);
  const [phase, setPhase] = useState<"compose" | "building" | "done">("compose");
  const [step, setStep] = useState(0);
  const steps = BUILD_STEPS[kind];

  function start() {
    if (kind === "pwa" && !prompt.trim()) return;
    setPhase("building");
    setStep(0);

    // Simulate build progress. In production, this would call the agent's
    // spawn_artifact tool via WebSocket and update steps based on real events.
    let i = 0;
    const iv = setInterval(() => {
      i++;
      if (i >= steps.length) {
        clearInterval(iv);
        setPhase("done");
        setStep(steps.length);
      } else {
        setStep(i);
      }
    }, 700);
  }

  function handleDone() {
    _artifactId++;
    const title =
      kind === "mindmap"
        ? `Mind map · ${scopeLabel}`
        : pwaTitle(prompt);

    onDone({
      id: `art-${_artifactId}`,
      type: kind,
      title,
      source: scopeLabel,
      prompt,
    });
  }

  const title =
    kind === "mindmap" ? "Generate mind map" : "Build a PWA";
  const subtitle =
    kind === "mindmap"
      ? `A visual map of the key ideas across ${scopeLabel}.`
      : "A standalone shadcn React app, deployed to a dynamic worker and saved for later.";

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="gen-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="gen-head">
          <div
            className="gen-ico"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            <Icon name={kind === "mindmap" ? "zap" : "sparkles"} size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.1 }}>
              {title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--muted-foreground)",
                marginTop: 4,
              }}
            >
              {subtitle}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Compose phase */}
        {phase === "compose" && (
          <div className="gen-body">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12,
                color: "var(--muted-foreground)",
                marginBottom: 16,
              }}
            >
              <Icon name="layers" size={13} />
              Source ·{" "}
              <strong style={{ color: "var(--foreground)" }}>
                {scopeLabel}
              </strong>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 550,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {kind === "mindmap" ? "Focus (optional)" : "Describe the app"}
              </label>
              <span
                style={{
                  fontSize: 11.5,
                  color: "var(--muted-foreground)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                {kind === "mindmap"
                  ? 'Leave blank for a balanced map, or steer it — e.g. "focus on the negotiation tactics."'
                  : "The agent turns this into a working PWA. You can keep iterating in chat after."}
              </span>
              <textarea
                className="input-press"
                style={{ minHeight: 84, width: "100%" }}
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  kind === "mindmap"
                    ? "e.g. emphasise the practical steps"
                    : "e.g. an interactive interview-prep coach with flashcards and a mock-interview timer"
                }
              />
            </div>

            {kind === "pwa" && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  marginBottom: 8,
                }}
              >
                {PWA_TEMPLATES.map((s) => (
                  <button
                    key={s}
                    className="chip"
                    style={{ height: 28, fontSize: 12 }}
                    onClick={() => setPrompt(`${s} based on ${scopeLabel}`)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 6,
              }}
            >
              <button
                className="btn"
                data-variant="ghost"
                data-size="sm"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn"
                data-variant="brand"
                data-size="sm"
                onClick={start}
                disabled={kind === "pwa" && !prompt.trim()}
              >
                <Icon name="sparkles" size={14} />
                {kind === "mindmap" ? "Generate" : "Build it"}
              </button>
            </div>
          </div>
        )}

        {/* Building / Done phases */}
        {phase !== "compose" && (
          <div className="gen-body">
            <div className="gen-steps">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className={`gen-step ${
                    i < step ? "done" : i === step ? "active" : ""
                  }`}
                >
                  <span className="gen-step-ico">
                    {i < step ? (
                      <Icon name="check" size={13} />
                    ) : i === step ? (
                      <Icon
                        name="refresh"
                        size={13}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                    ) : (
                      <span
                        className="dot"
                        style={{ background: "var(--muted-foreground)" }}
                      />
                    )}
                  </span>
                  {s}
                </div>
              ))}
            </div>

            {phase === "done" && (
              <div
                style={{
                  textAlign: "center",
                  paddingTop: 20,
                }}
              >
                <div
                  className="gen-ico"
                  style={{
                    background: "oklch(0.72 0.16 150 / 16%)",
                    color: "var(--ok)",
                    margin: "0 auto",
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon name="check" size={20} />
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    marginTop: 12,
                  }}
                >
                  {kind === "mindmap" ? "Mind map ready" : "PWA deployed"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted-foreground)",
                    marginTop: 6,
                  }}
                >
                  Saved to R2 and indexed in D1 — find it anytime in Studio.
                </div>
                <button
                  className="btn"
                  data-variant="brand"
                  data-size="sm"
                  style={{ marginTop: 16 }}
                  onClick={handleDone}
                >
                  Open in Studio <Icon name="arrowRight" size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pwaTitle(prompt: string): string {
  const trimmed = (prompt || "")
    .replace(/ based on .*/i, "")
    .trim();
  return trimmed
    ? (trimmed.charAt(0).toUpperCase() + trimmed.slice(1)).slice(0, 40)
    : "Generated app";
}

