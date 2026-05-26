export default function ErrorBanner({ message, onRetry }) {
  return (
    <div className="error-banner">
      <div className="error-banner-title">Could not parse file</div>
      <div className="error-banner-msg">{message}</div>
      <button type="button" onClick={onRetry}>Try a different file</button>
    </div>
  );
}
