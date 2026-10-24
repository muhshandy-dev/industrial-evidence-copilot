// Dimuat sebelum gaya selesai dirender agar tema tidak berkedip. Mengikuti sistem sampai pengguna memilih.
(() => {
  let saved = null;
  try { saved = localStorage.getItem("tema"); } catch { /* penyimpanan dinonaktifkan */ }
  const dark = saved ? saved === "gelap" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "gelap" : "terang";
})();
