/**
 * Strong password generation and a strength estimate — browser-side, using
 * crypto.getRandomValues with rejection sampling so every character is
 * equally likely (a plain `% length` slightly favours the first few).
 */

export type GeneratorOptions = {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  /** Leave out characters that are easy to misread: O/0, l/1/I … */
  avoidAmbiguous: boolean;
};

export const DEFAULT_GENERATOR: GeneratorOptions = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
};

// Symbols most sign-up forms accept.
const SETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*-_=+?",
};
const AMBIGUOUS = new Set("O0oIl1");

/** Uniform random integer in [0, n). */
function randomIndex(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export function generatePassword(options: GeneratorOptions = DEFAULT_GENERATOR): string {
  const pools = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => options[k])
    .map((k) => [...SETS[k]].filter((c) => !options.avoidAmbiguous || !AMBIGUOUS.has(c)).join(""));
  if (pools.length === 0) pools.push(SETS.lower);

  const length = Math.max(Math.min(options.length, 128), pools.length);
  const all = pools.join("");
  // One from every chosen set, so "digits on" really means there's a digit…
  const chars = pools.map((pool) => pool[randomIndex(pool.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  // …then shuffle so those guaranteed characters aren't always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const COMMON = [
  "password", "123456", "12345678", "qwerty", "abc123", "111111", "iloveyou", "admin",
  "welcome", "letmein", "facebook", "instagram", "pakistan", "google", "000000",
];

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; bits: number };

const LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];

/** A rough entropy estimate: character variety × length, docked for common
 *  words, repeats and keyboard/number runs. Good enough to flag the weak
 *  passwords clients tend to use; not a cracking-time guarantee. */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: LABELS[0], bits: 0 };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].map((re) => re.test(pw));
  const pool = [26, 26, 10, 20].reduce((sum, size, i) => sum + (classes[i] ? size : 0), 0);

  let bits = pw.length * Math.log2(Math.max(pool, 2));
  const lower = pw.toLowerCase();
  if (COMMON.some((w) => lower.includes(w))) bits -= 30;
  if (/(.)\1{2,}/.test(pw)) bits -= 10;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|zxcv)/i.test(pw)) bits -= 10;
  if (/(19|20)\d{2}/.test(pw)) bits -= 5; // years
  bits = Math.max(0, Math.round(bits));

  let score = (bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4) as Strength["score"];
  // "toniandguy2024": long-ish but a word + digits. Without mixing in more
  // kinds of character, only real length (a passphrase) earns "Strong".
  if (classes.filter(Boolean).length <= 2 && pw.length < 16) score = Math.min(score, 2) as Strength["score"];
  return { score, label: LABELS[score], bits };
}
