// Deterministic check: every expected string must appear in the answer (case-insensitive, thousands commas ignored, \frac{a}{b} read as a/b).
const norm = (s) => String(s).toLowerCase()
  .replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2')
  .replace(/(\d),(?=\d{3}\b)/g, '$1')
  .replace(/\s+/g, ' ');
export const score = (text, expect) => { const t = norm(text); return expect.every((e) => t.includes(norm(e))); };