export default function DaysBar({ days, amazonDays, isOos }) {
  if (isOos) {
    return (
      <div className="days-cell-content">
        <div className="oos-badge">OUT OF STOCK</div>
      </div>
    );
  }
  const d = Number(days) || 0;
  const pct = Math.min(100, (d / 60) * 100);
  const color = d < 30 ? '#dc2626' : d < 45 ? '#eab308' : '#16a34a';
  const critical = d > 0 && d < 14;

  const hasAmazon = amazonDays !== '' && amazonDays !== null && amazonDays !== undefined && Number.isFinite(Number(amazonDays));
  const amz = hasAmazon ? Math.round(Number(amazonDays)) : null;
  const title = hasAmazon
    ? `Display Days ${d.toFixed(1)}d ((Available + Inbound) ÷ Velocity) · Amazon Days ${amz}d`
    : `Display Days ${d.toFixed(1)}d ((Available + Inbound) ÷ Velocity)`;

  return (
    <div className="days-cell-content" title={title}>
      <div className="days-bar-bg">
        <div className="days-tick" />
        <div
          className="days-bar-fill"
          style={{ width: `${pct.toFixed(1)}%`, background: color }}
        />
      </div>
      <span className="days-big-wrap">
        <span className="days-big">
          {critical && <span className="days-alert" title="Below 14 days — critical" aria-label="Critical: less than 14 days">⚠</span>}
          {Math.round(d)}d
        </span>
        {hasAmazon && <span className="days-amazon">Amazon {amz}d</span>}
      </span>
    </div>
  );
}
