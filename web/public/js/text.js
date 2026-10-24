// Tokenisasi bahasa Indonesia. Harus identik dengan src/evidence/text.py;
// kasus bersama ada di tests/fixtures/tokenizer_cases.json (diuji di Python dan JavaScript).

export const STOPWORDS = new Set(
  `ada adalah agar akan atau antara apa apabila atas bagi bahwa bagaimana banyak baik
   beberapa bila bisa boleh dalam dan dapat dari dengan di dua guna hal harus hingga ini
   itu jika juga kami karena ke kepada kita lain lebih maka mana masing melalui mereka
   oleh pada para pula saat sampai sebagai sebuah seluruh semua serta setiap suatu sudah
   sehingga tanpa tentang terhadap tersebut tetapi untuk yang dimaksud dimaksudkan
   adapun yaitu yakni antar lagi saja lalu namun`.split(/\s+/).filter(Boolean),
);

const PARTICLES = ["lah", "kah", "tah", "pun"];
const POSSESSIVE = ["nya", "ku", "mu"];
const SUFFIXES = ["kan", "an"];
const PREFIXES = ["meng", "meny", "peng", "peny", "mem", "men", "pem", "pen", "ber", "bel", "ter", "per", "me", "pe", "di", "ke", "se"];
const MIN_STEM = 4;
const MELT = { meny: "s", peny: "s", mem: "p", pem: "p", men: "t", pen: "t" };

function stripSuffix(word, suffixes) {
  for (const suf of suffixes) {
    if (word.endsWith(suf) && word.length - suf.length >= MIN_STEM) return word.slice(0, -suf.length);
  }
  return word;
}

export function stem(word) {
  if (word.length <= MIN_STEM || /^\d+$/.test(word)) return word;
  word = stripSuffix(word, PARTICLES);
  word = stripSuffix(word, POSSESSIVE);
  word = stripSuffix(word, SUFFIXES);
  for (const pre of PREFIXES) {
    if (!word.startsWith(pre)) continue;
    const rest = word.slice(pre.length);
    let lead = "aiueo".includes(rest.slice(0, 1)) && rest.length > 0 ? MELT[pre] : undefined;
    if (lead === undefined && (pre === "meny" || pre === "peny")) lead = "s";
    const stemmed = (lead ?? "") + rest;
    if (stemmed.length >= MIN_STEM && rest.length >= 3) return stemmed;
  }
  return word;
}

export function tokenize(text, { useStem = true, dropStopwords = true } = {}) {
  const out = [];
  for (const tok of text.normalize("NFKC").toLowerCase().split(/[^a-z0-9]+/)) {
    if (tok.length < 2) continue;
    if (dropStopwords && STOPWORDS.has(tok)) continue;
    out.push(useStem ? stem(tok) : tok);
  }
  return out;
}
