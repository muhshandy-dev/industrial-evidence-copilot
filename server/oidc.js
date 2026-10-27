// Verifikasi token OIDC GitHub Actions untuk jalur evaluasi /api/jawab.
//
// Jalur evaluasi (memilih kandidat model dan varian prompt) hanya boleh dipanggil oleh workflow
// evaluasi repositori ini. Runner meminta token OIDC dari GitHub (permissions: id-token: write);
// fungsi memeriksa tanda tangan RS256 terhadap kunci publik GitHub dan klaimnya. Tidak ada secret
// yang perlu dibuat atau disimpan di mana pun.
export const OIDC_ISS = "https://token.actions.githubusercontent.com";
export const OIDC_AUD = "industrial-evidence-copilot-evaluasi";
export const OIDC_REPO = "muhshandy-dev/industrial-evidence-copilot";
// Workflow yang boleh memakai jalur evaluasi.
export const OIDC_WORKFLOW = [
  ".github/workflows/eksperimen-server.yml",
  ".github/workflows/tersegel.yml",
  ".github/workflows/holdout-v2.yml",
];
const JWKS_URL = `${OIDC_ISS}/.well-known/jwks`;

const dariB64url = (s) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const jsonB64url = (s) => JSON.parse(new TextDecoder().decode(dariB64url(s)));

let simpanan = { kunci: null, waktu: 0 };

async function ambilJwksBawaan() {
  const res = await fetch(JWKS_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`jwks HTTP ${res.status}`);
  return res.json();
}

async function kunciUntuk(kid, ambilJwks, sekarang) {
  // Kunci disimpan per isolate; diambil ulang bila kid belum dikenal (paling sering sekali per menit).
  if (!simpanan.kunci?.has(kid) && sekarang - simpanan.waktu > 60) {
    const { keys } = await ambilJwks();
    simpanan = { kunci: new Map(keys.filter((k) => k.kty === "RSA").map((k) => [k.kid, k])), waktu: sekarang };
  }
  const jwk = simpanan.kunci?.get(kid);
  if (!jwk) return null;
  return crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

// Mengembalikan klaim token bila sah, atau string alasan penolakan.
export async function periksaOidc(token, { ambilJwks = ambilJwksBawaan, sekarang = Math.floor(Date.now() / 1000) } = {}) {
  const bagian = typeof token === "string" ? token.split(".") : [];
  if (bagian.length !== 3) return "token_tidak_sah";
  let kepala, klaim;
  try { kepala = jsonB64url(bagian[0]); klaim = jsonB64url(bagian[1]); } catch { return "token_tidak_sah"; }
  if (kepala.alg !== "RS256" || typeof kepala.kid !== "string") return "algoritma_ditolak";
  const kunci = await kunciUntuk(kepala.kid, ambilJwks, sekarang);
  if (!kunci) return "kunci_tidak_dikenal";
  const sah = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", kunci, dariB64url(bagian[2]),
    new TextEncoder().encode(`${bagian[0]}.${bagian[1]}`));
  if (!sah) return "tanda_tangan_salah";
  if (klaim.iss !== OIDC_ISS) return "penerbit_salah";
  if (klaim.aud !== OIDC_AUD) return "audiens_salah";
  if (typeof klaim.exp !== "number" || klaim.exp < sekarang) return "kedaluwarsa";
  if (typeof klaim.nbf === "number" && klaim.nbf > sekarang + 60) return "belum_berlaku";
  if (klaim.repository !== OIDC_REPO) return "repositori_salah";
  const wf = String(klaim.job_workflow_ref ?? "");
  if (!OIDC_WORKFLOW.some((w) => wf.startsWith(`${OIDC_REPO}/${w}@`))) return "workflow_ditolak";
  return klaim;
}

// Untuk uji: kosongkan simpanan kunci.
export function lupakanKunci() { simpanan = { kunci: null, waktu: 0 }; }
