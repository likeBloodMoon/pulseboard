type Props = {
  label: string;
  value: string;
  status?: "ok" | "warn" | "bad";
  hint?: string;
};

export function StatCard({ label, value, status = "ok", hint }: Props) {
  const pillClass =
    status === "bad" ? "pill pill-bad" : status === "warn" ? "pill pill-warn" : "pill pill-ok";

  return (
    <div className="card">
      <div className="title-row">
        <span className="stat-label">{label}</span>
        <span className={pillClass}>{status.toUpperCase()}</span>
      </div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-label">{hint}</div> : null}
    </div>
  );
}
