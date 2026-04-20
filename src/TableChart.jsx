import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

export default function TableChart({ headers, rows }) {
  if (!Array.isArray(headers) || headers.length === 0) return null;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const numericCols = useMemo(() => {
    return headers.filter((h) => rows.some((r) => isNumber(r?.[h])));
  }, [headers, rows]);

  const [showChart, setShowChart] = useState(false);
  const [chartType, setChartType] = useState("line");
  const [xKey, setXKey] = useState(headers[0]);
  const [yKeys, setYKeys] = useState(() => (numericCols[0] ? [numericCols[0]] : []));
  const [barColor, setBarColor] = useState("#6366f1");

  useEffect(() => {
    if (!headers.includes(xKey)) {
      setXKey(headers[0]);
    }

    setYKeys((prev) => {
      const valid = prev.filter((y) => headers.includes(y) && numericCols.includes(y));
      if (valid.length > 0) return valid;
      return numericCols[0] ? [numericCols[0]] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers.join("|"), numericCols.join("|")]);

  if (!xKey || numericCols.length === 0) return null;

  const toggleY = (col) => {
    setYKeys((prev) => (prev.includes(col) ? prev.filter((x) => x !== col) : [...prev, col]));
  };

  return (
    <div style={{ marginTop: 12, width: "100%" }}>
      <div style={styles.controls}>
        <div style={styles.topRow}>
          <div style={styles.controlGroup}>
            <div style={styles.label}>Graph</div>
            <button
              type="button"
              onClick={() => setShowChart((prev) => !prev)}
              style={{
                ...styles.toggleBtn,
                ...(showChart ? styles.toggleBtnActive : {}),
              }}
            >
              {showChart ? "Hide graph" : "Show graph"}
            </button>
          </div>
        </div>

        <div style={styles.controlGroup}>
          <div style={styles.label}>Chart</div>
          <div style={styles.segment}>
            <button
              onClick={() => setChartType("line")}
              style={{ ...styles.segBtn, ...(chartType === "line" ? styles.segBtnActive : {}) }}
              type="button"
            >
              Line
            </button>
            <button
              onClick={() => setChartType("bar")}
              style={{ ...styles.segBtn, ...(chartType === "bar" ? styles.segBtnActive : {}) }}
              type="button"
            >
              Bar
            </button>
          </div>
        </div>

        {chartType === "bar" && (
          <div style={styles.controlGroup}>
            <div style={styles.label}>Bar color</div>
            <input
              type="color"
              value={barColor}
              onChange={(e) => setBarColor(e.target.value)}
              style={styles.colorInput}
              title="Select bar color"
            />
          </div>
        )}

        <div style={styles.controlGroup}>
          <div style={styles.label}>X column</div>
          <select value={xKey} onChange={(e) => setXKey(e.target.value)} style={styles.select}>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.controlGroup}>
          <div style={styles.label}>Y column(s)</div>
          <div style={styles.pills}>
            {numericCols.map((c) => (
              <button
                key={c}
                onClick={() => toggleY(c)}
                style={{ ...styles.pill, ...(yKeys.includes(c) ? styles.pillActive : {}) }}
                type="button"
              >
                {c}
              </button>
            ))}
          </div>
          {yKeys.length === 0 && <div style={styles.hint}>Select at least one Y column.</div>}
        </div>
      </div>

      {showChart && yKeys.length > 0 && (
        <div style={{ width: "100%", height: 340, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "bar" ? (
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={xKey} />
                <YAxis />
                <Tooltip />
                <Legend />
                {yKeys.map((y) => (
                  <Bar key={y} dataKey={y} fill={barColor} />
                ))}
              </BarChart>
            ) : (
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={xKey} />
                <YAxis />
                <Tooltip />
                <Legend />
                {yKeys.map((y) => (
                  <Line key={y} type="monotone" dataKey={y} dot={false} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const styles = {
  controls: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: 12,
    background: "rgba(255,255,255,0.04)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  controlGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, opacity: 0.8 },
  select: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e6e6e6",
    outline: "none",
  },
  colorInput: {
    width: 56,
    height: 36,
    padding: 0,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    background: "transparent",
    cursor: "pointer",
  },
  pills: { display: "flex", flexWrap: "wrap", gap: 8 },
  pill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.03)",
    color: "#e6e6e6",
    cursor: "pointer",
    fontSize: 12,
  },
  pillActive: {
    background: "rgba(99, 102, 241, 0.20)",
    border: "1px solid rgba(99, 102, 241, 0.35)",
  },
  segment: {
    display: "inline-flex",
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
    width: "fit-content",
  },
  segBtn: {
    padding: "8px 12px",
    background: "rgba(255,255,255,0.03)",
    color: "#e6e6e6",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
  },
  segBtnActive: {
    background: "rgba(99, 102, 241, 0.22)",
  },
  toggleBtn: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.03)",
    color: "#e6e6e6",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  toggleBtnActive: {
    background: "rgba(99, 102, 241, 0.22)",
    border: "1px solid rgba(99, 102, 241, 0.35)",
  },
  hint: { fontSize: 12, opacity: 0.7 },
};
