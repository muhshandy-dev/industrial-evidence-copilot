// Gerak hanya bila pengguna tidak memintanya dikurangi. Semua animasi bersifat fungsional:
// menunjukkan urutan, perpindahan fokus, atau bukti yang disorot.
const query = matchMedia("(prefers-reduced-motion: reduce)");

export const motionOn = () => !query.matches;

function sync() {
  document.documentElement.classList.toggle("gerak", motionOn());
}
sync();
query.addEventListener("change", sync);

// FLIP: pindahkan baris dari posisi lama ke posisi baru tanpa melompat.
export function flip(container, mutate, { duration = 550 } = {}) {
  const kids = [...container.children];
  const before = new Map(kids.map((k) => [k, k.getBoundingClientRect().top]));
  mutate();
  if (!motionOn()) return Promise.resolve();
  const anims = [];
  for (const k of container.children) {
    const dy = before.get(k) - k.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    anims.push(k.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }).finished);
  }
  return Promise.all(anims).catch(() => {});
}

export const wait = (ms) => new Promise((r) => setTimeout(r, motionOn() ? ms : 0));
