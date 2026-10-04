export function Wordmark() {
  return (
    <span className="wordmark" aria-label="KZ Home">
      <svg viewBox="0 0 40 40" aria-hidden="true"><path d="m8 18 12-10 12 10v14H8Z" /><path d="m16 19 8 8m0-8-8 8" /></svg>
      <span>KZ <span className="wordmark__home">Home</span><span className="wordmark__dot">.</span></span>
    </span>
  );
}
