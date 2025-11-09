import React, { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { Clock, Cpu, Layers, BarChart3, Database, X } from "lucide-react";

/** ------------------------------------------------------------------
 *  CONFIG
 *  ------------------------------------------------------------------ */
const ASSET_BASE = "";

// Updated palette to match the main app's turquoise/teal theme
const PALETTE = {
  cardBorder: "rgba(64, 224, 208, 0.2)",
  grid: "rgba(64, 224, 208, 0.15)",
  textDim: "rgba(224, 230, 237, 0.7)",
  cpu: "#60A5FA",
  gpu: "#34D399",
  mem: "#F3A6D8",
  primary: "#40e0d0", // Main turquoise color
  stageGlow: "66",
};

const FALLBACK_STAGE_COLORS = [
  "#7DD3FC",
  "#A5B4FC",
  "#C4B5FD",
  "#93C5FD",
  "#86EFAC",
  "#FDE68A",
  "#FCA5A5",
  "#FDBA74",
];

const KNOWN_STAGE_COLORS = new Map([
  ["Preprocessing", "#7DD3FC"],
  ["Template deconvolution", "#A5B4FC"],
  ["TemplateDeconvolution", "#A5B4FC"],
  ["Graph clustering", "#C4B5FD"],
  ["GraphClustering", "#C4B5FD"],
  ["Postprocessing", "#86EFAC"],
]);

/** Display-only substage rename map */
const SUBSTAGE_RENAMES = new Map([
  ["Merging", "Merging tree"],
  ["Final pass", "Graph-based clustering"],
  ["First pass", "Initial template learning"],
  ["Template learning", "Initial spike detection"],
  ["Graph based clustering", "Modularity-optimized clustering"],
  ["Graph-based clustering", "Modularity-optimized clustering"],
]);

/** ------------------------------------------------------------------
 *  HELPERS
 *  ------------------------------------------------------------------ */
const fmt = (n, d = 2) => (Number.isFinite(n) ? Number(n).toFixed(d) : "0.00");

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.text();
}
async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

/** Parse telemetry csv */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const header = lines[0].split(",");
  const idx = (name) => header.indexOf(name);
  const i_tabs = idx("t_abs");
  const i_stage = idx("stage");
  const i_sub = idx("substage");
  const i_cpu = idx("cpu_pct");
  const i_mem = idx("rss_mb");
  const i_threads = idx("threads");
  const i_gpu = idx("gpu_util_pct");
  const i_gpumem = idx("gpu_mem_mb");

  const rows = [];
  for (let k = 1; k < lines.length; k++) {
    const parts = lines[k].split(",");
    if (parts.length !== header.length) continue;
    const p = {
      t_abs: parseFloat(parts[i_tabs]),
      stage: parts[i_stage],
      substage: parts[i_sub],
      cpu: parseFloat(parts[i_cpu] || "0") || 0,
      memory: parseFloat(parts[i_mem] || "0") || 0,
      threads: parseFloat(parts[i_threads] || "0") || 0,
      gpu: parseFloat(parts[i_gpu] || "0") || 0,
      gpuMem: parseFloat(parts[i_gpumem] || "0") || 0,
    };
    if (Number.isFinite(p.t_abs)) rows.push(p);
  }
  rows.sort((a, b) => a.t_abs - b.t_abs);
  if (rows.length > 0) {
    const t0 = rows[0].t_abs;
    rows.forEach((r) => {
      r.time = r.t_abs - t0;
    });
  }
  return rows;
}

function weightedMean(pairs) {
  const s = pairs.reduce(
    (acc, p) => {
      const v = Number.isFinite(p.val) ? p.val : 0;
      const w = Number.isFinite(p.wt) ? p.wt : 0;
      return { num: acc.num + v * w, den: acc.den + w };
    },
    { num: 0, den: 0 }
  );
  return s.den > 0 ? s.num / s.den : 0;
}

const mbToGb = (mb) => (mb || 0) / 1024.0;

function normalizeStageSubstage(stage, substage) {
  const s = stage || "";
  const sub = substage || "";
  const isGraphClust = /^graph\s*clustering$/i.test(s);
  const isFirstPass = /^first\s*pass$/i.test(sub);
  if (isGraphClust && isFirstPass) {
    return { stage: "Template deconvolution", substage: "First pass" };
  }
  if (/^templ(a|e)te\s*deconvolution$/i.test(s)) {
    return { stage: "Template deconvolution", substage: sub };
  }
  if (/^graph\s*clustering$/i.test(s)) {
    return { stage: "Graph clustering", substage: sub };
  }
  return { stage: s, substage: sub };
}

/** Build ordered stage/substage data; inject dummy Postprocessing if missing (2s). */
function buildFromSummaries(summariesObj) {
  const raws = Object.entries(summariesObj || {}).map(([key, m]) => {
    const dot = key.indexOf(".");
    const rawStage = dot >= 0 ? key.slice(0, dot) : key; // <-- fixed (removed stray "the")
    const rawSub = dot >= 0 ? key.slice(dot + 1) : "";
    const norm = normalizeStageSubstage(rawStage, rawSub);

    return {
      stage: norm.stage,
      substage: norm.substage,
      runtime_s: m.runtime_s || 0,
      cpu_pct_system: m.cpu_mean_pct_of_system || 0,
      cpu_mean_cores: m.mean_cores || 0,
      gpu_mean_pct: m.gpu_mean_pct || 0,
      rss_peak_mb: m.rss_peak_mb || 0,
      order: Number.isFinite(m.order) ? m.order : 1e9,
      t_start_abs: Number.isFinite(m.t_start_abs) ? m.t_start_abs : NaN,
      t_end_abs: Number.isFinite(m.t_end_abs) ? m.t_end_abs : NaN,
    };
  });

  if (!raws.some((r) => r.stage === "Postprocessing")) {
    const maxOrder = raws.reduce((m, r) => Math.max(m, r.order || 0), 0);
    raws.push({
      stage: "Postprocessing",
      substage: "Save and export",
      runtime_s: 2.0,
      cpu_pct_system: 5.0,
      cpu_mean_cores: 0.05,
      gpu_mean_pct: 0.0,
      rss_peak_mb: 100.0,
      order: maxOrder + 1,
      t_start_abs: NaN,
      t_end_abs: NaN,
    });
  }

  raws.sort((a, b) => a.order - b.order);

  const byStage = new Map();
  for (const r of raws) {
    if (!byStage.has(r.stage)) byStage.set(r.stage, []);
    byStage.get(r.stage).push(r);
  }

  let fallbackIdx = 0;
  const colorFor = (stage) =>
    KNOWN_STAGE_COLORS.get(stage) ??
    FALLBACK_STAGE_COLORS[fallbackIdx++ % FALLBACK_STAGE_COLORS.length];

  const stageData = [];
  for (const [stage, subs] of byStage.entries()) {
    const time = subs.reduce((acc, s) => acc + (s.runtime_s || 0), 0);
    const cpuW = weightedMean(
      subs.map((s) => ({ val: s.cpu_pct_system || 0, wt: s.runtime_s || 0 }))
    );
    const gpuW = weightedMean(
      subs.map((s) => ({ val: s.gpu_mean_pct || 0, wt: s.runtime_s || 0 }))
    );
    const peakMemMB = subs.reduce(
      (acc, s) => Math.max(acc, s.rss_peak_mb || 0),
      0
    );
    const color = colorFor(stage);

    const substages = subs
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((s) => stage !== "Postprocessing")
      .map((s) => ({
        name: SUBSTAGE_RENAMES.get(s.substage) || s.substage || "(unnamed)",
        time: s.runtime_s || 0,
        memory: mbToGb(s.rss_peak_mb),
        cpuLoadSystem: s.cpu_pct_system || 0,
        cpuCores: s.cpu_mean_cores || 0,
        gpuLoad: s.gpu_mean_pct || 0,
        order: s.order || 0,
      }));

    stageData.push({
      name: stage,
      time,
      memory: mbToGb(peakMemMB),
      cpuLoadSystem: cpuW,
      gpuLoad: gpuW,
      color,
      substages,
    });
  }

  return { raws, stageData };
}

function buildWindows(raws, timeline) {
  if (!raws || raws.length === 0 || !timeline || timeline.length === 0) return [];
  const t0 = timeline[0].t_abs;
  return raws
    .filter(
      (r) => Number.isFinite(r.t_start_abs) && Number.isFinite(r.t_end_abs)
    )
    .map((r) => {
      const norm = normalizeStageSubstage(r.stage, r.substage);
      const labelSub = SUBSTAGE_RENAMES.get(norm.substage) || norm.substage;
      return {
        label: `${norm.stage} · ${labelSub}`,
        stage: norm.stage,
        startX: r.t_start_abs - t0,
        endX: r.t_end_abs - t0,
      };
    })
    .filter((w) => w.endX >= w.startX);
}

function computeToplineFromSummaries(raws, stageData) {
  const totalTime = stageData.reduce((acc, s) => acc + (s.time || 0), 0);
  const avgCpuSystem = weightedMean(
    raws.map((r) => ({ val: r.cpu_pct_system || 0, wt: r.runtime_s || 0 }))
  );
  const avgGpu = weightedMean(
    raws.map((r) => ({ val: r.gpu_mean_pct || 0, wt: r.runtime_s || 0 }))
  );
  const peakMemGB = Math.max(0, ...stageData.map((s) => s.memory || 0));
  return { totalTime, avgCpuSystem, avgGpu, peakMemGB };
}

/** ------------------------------------------------------------------
 *  COMPONENT
 *  ------------------------------------------------------------------ */
const RuntimeAnalysisView = () => {
  const [selectedMetric, setSelectedMetric] = useState("time"); // 'time' | 'memory' | 'cpu' | 'gpu'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stageData, setStageData] = useState([]);
  const [raws, setRaws] = useState([]);
  const [timeline, setTimeline] = useState([]);

  const [expandedStageIdx, setExpandedStageIdx] = useState(null); // Stage Track expansion

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError("");
        const [sj, csvTxt] = await Promise.all([
          fetchJSON(`${ASSET_BASE}/perf_summaries_sanitized.json`),
          fetchText(`${ASSET_BASE}/perf_timeseries.csv`),
        ]);
        if (cancelled) return;
        const { raws, stageData } = buildFromSummaries(sj);
        const samples = parseCSV(csvTxt);
        setRaws(raws);
        setStageData(stageData);
        setTimeline(samples);
      } catch (e) {
        console.error("Failed to load telemetry assets:", e);
        setError(String(e?.message || e));
        setRaws([]);
        setStageData([]);
        setTimeline([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const windows = useMemo(() => buildWindows(raws, timeline), [raws, timeline]);
  const topline = useMemo(
    () => computeToplineFromSummaries(raws, stageData),
    [raws, stageData]
  );

  const metricValue = (item, parent) => {
    switch (selectedMetric) {
      case "time":
        return item.time;
      case "memory":
        return item.memory ?? (parent ? parent.memory * (item.time / (parent.time || 1)) : 0);
      case "cpu":
        return item.cpuLoadSystem ?? (parent ? parent.cpuLoadSystem : 0);
      case "gpu":
        return item.gpuLoad ?? (parent ? parent.gpuLoad : 0);
      default:
        return 0;
    }
  };

  if (loading) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(224, 230, 237, 0.7)',
        fontSize: '1rem'
      }}>
        Loading telemetry data...
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload[0]) {
      return (
        <div style={{
          background: 'rgba(30, 30, 60, 0.95)',
          backdropFilter: 'blur(10px)',
          padding: '0.75rem',
          borderRadius: '8px',
          border: '1px solid rgba(64, 224, 208, 0.3)'
        }}>
          <p style={{ color: '#40e0d0', fontSize: '0.9rem', fontWeight: '600' }}>{`${fmt(label, 2)} s`}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {entry.name}: <span style={{ color: '#40e0d0', fontFamily: 'monospace' }}>{fmt(entry.value, 2)}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const metricTabs = (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {["time", "memory", "cpu", "gpu"].map((key) => (
        <button
          key={key}
          onClick={() => setSelectedMetric(key)}
          style={{
            padding: '0.4rem 0.75rem',
            fontSize: '0.75rem',
            borderRadius: '6px',
            border: selectedMetric === key ? '1px solid #40e0d0' : '1px solid rgba(64, 224, 208, 0.2)',
            background: selectedMetric === key ? 'linear-gradient(135deg, #40e0d0 0%, #0d9488 100%)' : 'rgba(30, 30, 60, 0.6)',
            color: selectedMetric === key ? '#0f172a' : 'rgba(224, 230, 237, 0.7)',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (selectedMetric !== key) {
              e.currentTarget.style.background = 'rgba(64, 224, 208, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(64, 224, 208, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedMetric !== key) {
              e.currentTarget.style.background = 'rgba(30, 30, 60, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(64, 224, 208, 0.2)';
            }
          }}
        >
          {key.toUpperCase()}
        </button>
      ))}
    </div>
  );

  // ----- utils: element size -----
  function useElementSize() {
    const ref = useRef(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
      if (!ref.current) return;
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const cr = e.contentRect;
          setSize({ width: cr.width, height: cr.height });
        }
      });
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    return [ref, size];
  }

  // ----- Stage Track -----
  const StageTrack = ({ stages }) => {
    const [trackRef, trackSize] = useElementSize();
    const gapPx = 8; // gap between stage segments
    const paddingPx = 0; // inner wrapper already padded

    const values = stages.map((s) => Math.max(0, metricValue(s)));

    // Fit-to-width allocation with per-segment minimum (prevents scroll/overflow)
    const minStagePx = 120; // ensure readability & consistency
    const available = Math.max(
      0,
      trackSize.width - paddingPx - gapPx * Math.max(0, stages.length - 1)
    );

    function allocate(widthAvailable, vals, minPx) {
      const n = vals.length;
      if (n === 0) return [];
      const base = Array(n).fill(minPx);
      const baseSum = minPx * n;
      const extra = Math.max(0, widthAvailable - baseSum);
      if (extra === 0) return base;
      const sumVals = vals.reduce((a, b) => a + b, 0) || 1;
      return vals.map((v) => base[0] + (v / sumVals) * extra);
    }

    const stageWidths = allocate(available, values, minStagePx);

    return (
      <div style={{
        width: '100%',
        borderRadius: '12px',
        border: `1px solid ${PALETTE.cardBorder}`,
        background: 'rgba(30, 30, 60, 0.6)',
        backdropFilter: 'blur(10px)'
      }}>
        {/* Tabs + title */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid rgba(64, 224, 208, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', fontWeight: '600', color: '#40e0d0' }}>
            <Layers style={{ width: '20px', height: '20px' }} />
            <span>Stage Track</span>
          </div>
          {metricTabs}
        </div>

        {/* Main track (no horizontal scroll; segments are pixel-fitted) */}
        <div style={{ padding: '1rem 1.25rem' }}>
          <div style={{ position: 'relative', width: '100%', background: 'rgba(15, 15, 35, 0.6)', borderRadius: '8px', padding: '0.5rem' }}>
            <div ref={trackRef} style={{ display: 'flex', width: '100%', gap: '0.5rem' }}>
              {stages.map((s, idx) => {
                const w = Math.max(0, stageWidths[idx] || 0);
                const showText = w >= 120;
                return (
                  <button
                    key={idx}
                    title={s.name}
                    onClick={() => {
                      setExpandedStageIdx(idx);
                    }}
                    style={{
                      width: `${w}px`,
                      height: '3.5rem',
                      borderRadius: '8px',
                      position: 'relative',
                      flexShrink: 0,
                      background: `${s.color}22`,
                      boxShadow: expandedStageIdx === idx
                        ? `inset 0 0 0 2px ${s.color}88, 0 0 22px ${s.color}22`
                        : "none",
                      outline: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '8px',
                        background: `linear-gradient(90deg, ${s.color}55, ${s.color}AA)`,
                      }}
                    />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.75rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          zIndex: 10,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                          display: showText ? 'block' : 'none'
                        }}
                      >
                        {s.name}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontFamily: 'monospace',
                        zIndex: 10,
                        display: showText ? 'block' : 'none'
                      }}>
                        {selectedMetric === "time" && `${fmt(s.time, 2)}s`}
                        {selectedMetric === "memory" && `${fmt(s.memory, 2)}GB`}
                        {selectedMetric === "cpu" && `${Math.round(s.cpuLoadSystem)}%`}
                        {selectedMetric === "gpu" && `${Math.round(s.gpuLoad)}%`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Substage expansion */}
            {expandedStageIdx !== null && stages[expandedStageIdx] && (
              <SubstageTrack
                stage={stages[expandedStageIdx]}
                onClose={() => {
                  setExpandedStageIdx(null);
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  // ----- Substage Track (label-safe, consistent spacing) -----
  const SubstageTrack = ({ stage, onClose }) => {
    const [subRef, subSize] = useElementSize();

    // --- Layout & sizing rules for bulletproof labels ---
    const gapPx = 12; // more breathing room between bars

    // Estimate min width needed for each label to fit on one line with padding.
    function labelMinPx(name) {
      const n = (name || "").length;
      const estimate = 8 * n + 40; // ~8px per char + padding
      return Math.max(100, Math.min(estimate, 240)); // clamp
    }

    // Allocate width with per-item minimums so labels never overflow.
    function allocateWithMins(widthAvailable, vals, mins) {
      const n = vals.length;
      if (n === 0) return [];
      const minSum = mins.reduce((a, b) => a + b, 0);
      const extra = Math.max(0, widthAvailable - minSum);
      if (extra === 0) return mins.slice();
      const sumVals = vals.reduce((a, b) => a + b, 0) || 1;
      return vals.map((v, i) => mins[i] + (v / sumVals) * extra);
    }

    const subs = stage.substages || [];
    const values = subs.map((sub) => Math.max(0, metricValue(sub, stage)));
    const perItemMins = subs.map((s) => labelMinPx(s.name));

    // Available width inside the row (minus gaps between bars)
    const available = Math.max(
      0,
      subSize.width - gapPx * Math.max(0, values.length - 1)
    );
    const widths = allocateWithMins(available, values, perItemMins);

    return (
      <div style={{
        marginTop: '0.75rem',
        borderRadius: '8px',
        border: '1px solid rgba(64, 224, 208, 0.2)',
        background: 'rgba(15, 15, 35, 0.7)'
      }}>
        {/* Header (always visible; includes Close) */}
        <div style={{
          padding: '0.75rem 1rem 0.5rem',
          borderBottom: '1px solid rgba(64, 224, 208, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '0.9rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: stage.color
              }}
            />
            <span>{stage.name} — substages</span>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              background: 'rgba(30, 30, 60, 0.6)',
              border: '1px solid rgba(64, 224, 208, 0.2)',
              color: 'rgba(224, 230, 237, 0.8)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(64, 224, 208, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(64, 224, 208, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(30, 30, 60, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(64, 224, 208, 0.2)';
            }}
          >
            <X style={{ width: '12px', height: '12px' }} /> Close substages
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '0.75rem 1rem' }}>
          {subs.length === 0 ? (
            <div style={{
              borderRadius: '8px',
              border: '1px solid rgba(64, 224, 208, 0.2)',
              background: 'rgba(15, 15, 35, 0.7)',
              padding: '1rem 1rem 1.25rem',
              fontSize: '0.9rem',
              color: 'rgba(224, 230, 237, 0.8)'
            }}>
              This stage has no substages.
            </div>
          ) : (
            <div ref={subRef} style={{ display: 'flex', width: '100%', flexWrap: 'wrap', gap: '0.75rem' }}>
              {subs.map((sub, i) => {
                const w = Math.max(0, widths[i] || 0);
                const showInside = w >= 140; // put title inside when roomy; otherwise above

                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', width: `${w}px` }}>
                    {/* Title line (always rendered, hidden when placed inside) */}
                    <div
                      style={{
                        marginBottom: '0.25rem',
                        fontSize: '0.7rem',
                        color: 'rgba(224, 230, 237, 0.8)',
                        lineHeight: '1.25',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: showInside ? 'none' : 'block'
                      }}
                      title={sub.name}
                    >
                      {sub.name || "(unnamed)"}
                    </div>

                    <div
                      style={{
                        position: 'relative',
                        height: '2.5rem',
                        borderRadius: '6px',
                        background: `${stage.color}22`
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '6px',
                          background: `linear-gradient(90deg, ${stage.color}44, ${stage.color}88)`,
                        }}
                      />

                      {/* Inside contents */}
                      <div style={{ position: 'absolute', inset: 0, padding: '0 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: '500',
                            color: 'rgba(255, 255, 255, 0.95)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                            display: showInside ? 'block' : 'none'
                          }}
                          title={sub.name}
                        >
                          {sub.name || "(unnamed)"}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.85)', fontFamily: 'monospace' }}>
                          {selectedMetric === "time" && `${fmt(sub.time, 2)}s`}
                          {selectedMetric === "memory" && `${fmt(sub.memory ?? 0, 2)}GB`}
                          {selectedMetric === "cpu" && `${Math.round(sub.cpuLoadSystem ?? stage.cpuLoadSystem)}%`}
                          {selectedMetric === "gpu" && `${Math.round(sub.gpuLoad ?? stage.gpuLoad)}%`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const avgCPU = topline.avgCpuSystem || 0;
  const avgGPU = topline.avgGpu || 0;
  const peakMemGB = topline.peakMemGB || 0;
  const totalTime = topline.totalTime || 0;

  return (
    <div style={{
      height: '100%',
      width: '100%',
      overflowY: 'auto',
      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
      color: '#e0e6ed',
      padding: '1.5rem',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', height: '100%' }}>
        <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto auto auto minmax(280px, 1fr)', gap: '1rem' }}>
          {/* Header */}
          <div style={{ position: 'relative' }}>
            <h1 style={{
              fontSize: '1.8rem',
              fontWeight: '600',
              marginBottom: '0.5rem',
              color: '#40e0d0',
              textShadow: '0 0 10px rgba(64, 224, 208, 0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              Runtime Analysis
              <span style={{
                fontSize: '0.65rem',
                padding: '0.25rem 0.6rem',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
                color: '#0f172a',
                fontWeight: '600'
              }}>
                Prototype
              </span>
            </h1>
            <p style={{ color: 'rgba(224, 230, 237, 0.7)', fontSize: '0.9rem' }}>
              Complete algorithm performance breakdown
            </p>
            {error && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(239, 68, 68, 0.1)',
                fontSize: '0.85rem'
              }}>
                Failed to load telemetry. {error}
              </div>
            )}
          </div>

          {/* Key Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {[
              {
                label: "Total Time",
                value: `${fmt(totalTime, 2)}s`,
                icon: Clock,
                badge: "TIME",
                color: "#40e0d0",
              },
              {
                label: "Avg CPU (of system)",
                value: `${Math.round(avgCPU)}%`,
                icon: Cpu,
                badge: "USAGE",
                color: "#60A5FA",
              },
              {
                label: "Avg GPU",
                value: `${Math.round(avgGPU)}%`,
                icon: Cpu,
                badge: "USAGE",
                color: "#34D399",
              },
              {
                label: "Peak Memory",
                value: `${fmt(peakMemGB, 2)}GB`,
                icon: Database,
                badge: "MEMORY",
                color: "#F3A6D8",
              },
            ].map((metric, idx) => (
              <div key={idx} style={{
                background: 'rgba(30, 30, 60, 0.6)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(64, 224, 208, 0.2)',
                borderRadius: '8px',
                padding: '0.75rem',
                minHeight: '92px',
                transition: 'all 0.2s ease',
                cursor: 'default'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(64, 224, 208, 0.5)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(64, 224, 208, 0.2)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <metric.icon style={{ width: '20px', height: '20px', color: metric.color }} />
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '12px',
                    background: `${metric.color}30`,
                    color: metric.color,
                    fontWeight: '600',
                    border: `1px solid ${metric.color}50`
                  }}>
                    {metric.badge}
                  </span>
                </div>
                <p style={{ fontSize: '1.125rem', fontWeight: '700', fontFamily: 'monospace', margin: '0.25rem 0' }}>
                  {metric.value}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'rgba(224, 230, 237, 0.6)' }}>
                  {metric.label}
                </p>
              </div>
            ))}
          </div>

          {/* Stage Track */}
          <div>
            <StageTrack stages={stageData} />
          </div>

          {/* Hardware Utilization (fills remaining space) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', minHeight: 0 }}>
            {[{ key: 'cpu', title: 'CPU Utilization (process %)', color: PALETTE.cpu, yLabel: 'CPU %', dataKey: 'cpu', stroke: PALETTE.cpu, yDomain: [0, 'auto'] },
              { key: 'gpu', title: 'GPU Utilization', color: PALETTE.gpu, yLabel: 'GPU %', dataKey: 'gpu', stroke: PALETTE.gpu, yDomain: [0, 100] },
              { key: 'mem', title: 'Memory (RSS MB)', color: PALETTE.mem, yLabel: 'RSS (MB)', dataKey: 'memory', stroke: PALETTE.mem, yDomain: ['dataMin', 'dataMax'] }]
              .map((cfg) => (
                <div
                  key={cfg.key}
                  style={{
                    background: 'rgba(30, 30, 60, 0.5)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '12px',
                    border: `1px solid ${PALETTE.cardBorder}`,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0
                  }}
                >
                  <div style={{ padding: '1rem' }}>
                    <h2 style={{ fontSize: '0.95rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', color: cfg.color }}>
                      <BarChart3 style={{ width: '20px', height: '20px' }} />
                      {cfg.title}
                    </h2>
                  </div>
                  {/* Chart area grows to fill and never collapses due to minmax on grid row */}
                  <div style={{ padding: '0 1rem 1rem', flex: 1, minHeight: 0 }}>
                    <div style={{ height: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeline}>
                          <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.grid} />
                          {windows.map((w, i2) => {
                            const color = KNOWN_STAGE_COLORS.get(w.stage) ?? "#93C5FD";
                            return (
                              <ReferenceArea
                                key={`${w.label}-${cfg.key}-${i2}`}
                                x1={w.startX}
                                x2={w.endX}
                                strokeOpacity={0}
                                fill={color}
                                fillOpacity={0.08}
                              />
                            );
                          })}
                          <XAxis
                            dataKey="time"
                            stroke={PALETTE.textDim}
                            tick={{ fontSize: 10 }}
                            label={{
                              value: "Time (s)",
                              position: "insideBottom",
                              offset: -5,
                              style: { fill: PALETTE.textDim, fontSize: 11 },
                            }}
                            tickFormatter={(v) => Number(v).toFixed(2)}
                          />
                          <YAxis
                            stroke={PALETTE.textDim}
                            tick={{ fontSize: 10 }}
                            label={{
                              value: cfg.yLabel,
                              angle: -90,
                              position: "insideLeft",
                              style: { fill: PALETTE.textDim, fontSize: 11 },
                            }}
                            domain={cfg.yDomain}
                            tickFormatter={(v) => Number(v).toFixed(2)}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Line
                            type="monotone"
                            dataKey={cfg.dataKey}
                            stroke={cfg.stroke}
                            strokeWidth={2}
                            dot={false}
                            name={cfg.yLabel}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RuntimeAnalysisView;
