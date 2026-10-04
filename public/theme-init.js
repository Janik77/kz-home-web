// Apply a saved preference before paint. Storage can be unavailable in private contexts.
try {
  const preference = localStorage.getItem('kz-home-theme');
  const dark = preference === 'dark' ||
    (preference !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
