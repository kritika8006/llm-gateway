import { useEffect, useState } from 'react';

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const fmt = (n) => Number(n).toLocaleString();
const ms = (x) => (x == null ? 'no data' : x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`);
const utc = (h) => new Date(`${h}:00:00Z`);
const fullLabel = (h) => utc(h).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric' });

const SOURCES = [
  { key: 'cache', label: 'Cache', color: 'var(--seg-cache)' },
  { key: 'cheap', label: 'Cheap model', color: 'var(--seg-cheap)' },
  { key: 'strong', label: 'Strong model', color: 'var(--seg-strong)' },
  { key: 'unrouted', label: 'Not routed', color: 'var(--seg-unrouted)' },
  { key: 'error', label: 'Failed', color: 'var(--seg-error)' },
];

/* ---------- chart helpers ---------- */

// Axis ticks that land on round numbers (0, 5, 10 ...), always whole requests.
export function niceTicks(max) {
  const raw = Math.max(max, 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw));
  const top = Math.ceil(Math.max(max, 1) / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

// The log only has hours that saw traffic; add the empty hours so the time axis is honest.
export function fillHours(byHour) {
  if (!byHour.length) return [];
  const known = new Map(byHour.map((h) => [h.hour, h]));
  const start = utc(byHour[0].hour).getTime(), end = utc(byHour[byHour.length - 1].hour).getTime();
  const out = [];
  for (let t = start; t <= end && out.length < 200; t += 3600e3) {
    const hour = new Date(t).toISOString().slice(0, 13);
    out.push(known.get(hour) || { hour, requests: 0, cacheHits: 0 });
  }
  return out;
}

const polar = (c, r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };

/* ---------- charts ---------- */

function Pie({ routes, total }) {
  const C = 100, R = 88;
  let angle = 0;
  const slices = SOURCES.filter((s) => routes[s.key] > 0).map((s) => {
    const sweep = (360 * routes[s.key]) / total;
    const slice = { ...s, a0: angle, a1: angle + sweep, sweep };
    angle += sweep;
    return slice;
  });
  return (
    <div className="pie">
      <svg viewBox="0 0 200 200" role="img" aria-label={`Pie chart of ${total} requests: ${SOURCES.map((s) => `${s.label} ${routes[s.key]}`).join(', ')}`}>
        {total === 0 && <circle cx={C} cy={C} r={R} className="pie-empty" />}
        {total > 0 && slices.length === 1 && <circle cx={C} cy={C} r={R} style={{ fill: slices[0].color }} className="pie-slice" />}
        {total > 0 && slices.length > 1 && slices.map((s) => {
          const [x0, y0] = polar(C, R, s.a0), [x1, y1] = polar(C, R, s.a1);
          return (
            <path key={s.key} className="pie-slice" style={{ fill: s.color }}
              d={`M${C} ${C} L${x0} ${y0} A${R} ${R} 0 ${s.sweep > 180 ? 1 : 0} 1 ${x1} ${y1} Z`}>
              <title>{`${s.label}: ${routes[s.key]} (${pct(routes[s.key] / total)})`}</title>
            </path>
          );
        })}
      </svg>
      <table className="legend">
        <thead><tr><th scope="col">Answered by</th><th scope="col">Requests</th><th scope="col">Share</th></tr></thead>
        <tbody>
          {SOURCES.map((s) => (
            <tr key={s.key}>
              <td><i style={{ background: s.color }} />{s.label}</td>
              <td>{fmt(routes[s.key])}</td>
              <td>{total ? pct(routes[s.key] / total) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarChart({ byHour }) {
  const data = fillHours(byHour);
  if (!data.length) return <p className="empty">No requests in this window yet.</p>;
  const { top, ticks } = niceTicks(Math.max(...data.map((h) => h.requests)));
  const every = Math.ceil(data.length / 8);
  const short = (h) => (data.length <= 24 ? utc(h).toLocaleTimeString([], { hour: 'numeric' }) : utc(h).toLocaleDateString([], { day: 'numeric', month: 'short' }));
  return (
    <>
      <div className="key">
        <span><i style={{ background: 'var(--bar-cache)' }} />Answered from cache</span>
        <span><i style={{ background: 'var(--bar-model)' }} />Answered by a model or failed</span>
      </div>
      <div className="axis-title">Requests per hour</div>
      <div className="bc">
        <div className="bc-y">{ticks.map((t) => <span key={t} style={{ bottom: `${(100 * t) / top}%` }}>{t}</span>)}</div>
        <div className="bc-plot">
          {ticks.map((t) => <div key={t} className="bc-grid" style={{ bottom: `${(100 * t) / top}%` }} />)}
          <div className="bc-cols">
            {data.map((h) => (
              <div key={h.hour} className="bc-col" title={`${fullLabel(h.hour)}: ${h.requests} requests, ${h.cacheHits} from cache`}>
                <div className="bc-bar" style={{ height: `${(100 * h.requests) / top}%` }}>
                  <div className="bc-hit" style={{ height: `${h.requests ? (100 * h.cacheHits) / h.requests : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bc-x">{data.map((h, i) => <span key={h.hour}>{i % every === 0 && <em>{short(h.hour)}</em>}</span>)}</div>
      </div>
      <div className="axis-title center">Time, in your timezone</div>
    </>
  );
}

function Latency({ latency }) {
  const rows = [
    { label: 'Answered from cache', d: latency.cache, color: 'var(--seg-cache)' },
    { label: 'Answered by a model', d: latency.model, color: 'var(--bar-model)' },
  ];
  const max = Math.max(1, ...rows.map((r) => r.d.p95 || 0));
  const speedup = latency.cache.p50 && latency.model.p50 ? (latency.model.p50 / latency.cache.p50).toFixed(1) : null;
  return (
    <>
      <div className="lat-grid">
        {rows.map((r) => (
          <div className="lat" key={r.label}>
            <div className="lat-head"><span>{r.label}</span><span className="muted">{fmt(r.d.n)} requests</span></div>
            <div className="lat-track">
              {r.d.p95 != null && <div className="lat-slow" style={{ width: `${(100 * r.d.p95) / max}%`, background: r.color }} />}
              {r.d.p50 != null && <div className="lat-typical" style={{ width: `${(100 * r.d.p50) / max}%`, background: r.color }} />}
            </div>
            <div className="lat-nums">Typical {ms(r.d.p50)}. The slowest 5% took {ms(r.d.p95)} or more.</div>
          </div>
        ))}
      </div>
      {speedup && <p className="note">Cache answers arrive about {speedup} times faster than model answers at the median.</p>}
    </>
  );
}

/* ---------- answer text: turns the model's markdown into clean formatting ---------- */

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).filter(Boolean).map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={i}>{p.slice(1, -1)}</code>;
    if (/^\*[^*\s][^*]*\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

const BULLET = /^\s*[*-]\s+/, NUMBERED = /^\s*\d+[.)]\s+/, HEADING = /^#{1,6}\s+/, RULE = /^\s*([-*_])\1{2,}\s*$/;

export function Markdown({ text }) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      i++;
      out.push(<pre className="code" key={k++}><code>{code.join('\n')}</code></pre>);
    } else if (RULE.test(line)) { out.push(<hr key={k++} />); i++; }
    else if (HEADING.test(line)) { out.push(<h4 key={k++}>{inline(line.replace(HEADING, ''))}</h4>); i++; }
    else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line), re = ordered ? NUMBERED : BULLET, items = [];
      for (; i < lines.length && re.test(lines[i]); i++) items.push(lines[i].replace(re, ''));
      const Tag = ordered ? 'ol' : 'ul';
      out.push(<Tag key={k++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</Tag>);
    } else if (!line.trim()) { i++; }
    else {
      const para = [];
      for (; i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !HEADING.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBERED.test(lines[i]) && !RULE.test(lines[i]); i++) para.push(lines[i]);
      out.push(<p key={k++}>{para.flatMap((l, j) => (j ? [<br key={`b${j}`} />, ...inline(l)] : inline(l)))}</p>);
    }
  }
  return <div className="answer">{out}</div>;
}

const plain = (t) => String(t).replace(/```/g, '').replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*\*\s+/gm, '- ');

/* ---------- try it ---------- */

const PAIR = ['What is Redis?', 'Explain Redis in one line'];

function TryIt() {
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState('demo');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function send() {
    if (busy || !prompt.trim()) return;
    const asked = prompt;
    setBusy(true); setCopied(false);
    try {
      const r = await fetch('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ prompt: asked }) });
      setOut({ asked, status: r.status, ...(await r.json()) });
    } catch (e) { setOut({ asked, status: 0, error: `Could not reach the gateway: ${e.message}` }); }
    setBusy(false);
  }

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  const copy = async () => { try { await navigator.clipboard.writeText(plain(out.text)); setCopied(true); } catch { /* clipboard blocked */ } };

  const facts = out && [
    ['Answered by', out.provider], ['Cache', out.cache], ['Route', out.route],
    ['Similarity', out.similarity], ['Time', out.latencyMs != null ? ms(out.latencyMs) : null],
  ].filter(([, v]) => v != null && v !== '');

  return (
    <section className="try" aria-labelledby="try-h">
      <h2 id="try-h">Try the gateway</h2>
      <p className="note">Send the first prompt, wait for the answer, then send the second. If the cache works, the second one comes back almost instantly.</p>
      <div className="presets">
        {PAIR.map((p, i) => <button key={p} className="chip" onClick={() => setPrompt(p)}>{i + 1}. {p}</button>)}
      </div>

      <div className="composer">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={onKey} rows={2} placeholder="Ask anything. Press Enter to send." aria-label="Prompt" />
        <div className="composer-bar">
          <label className="apikey"><span>API key</span><input value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" /></label>
          <button className="send" onClick={send} disabled={busy || !prompt.trim()} aria-label={busy ? 'Sending' : 'Send prompt'}>
            {busy ? <span className="dots" aria-hidden="true">...</span> : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            )}
          </button>
        </div>
      </div>

      {out && (
        <div className="thread" aria-live="polite">
          <div className="q">{out.asked}</div>
          <div className="a">
            <dl className="facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
            {out.text ? <Markdown text={out.text} /> : <p className="answer-error">{out.error}</p>}
            {out.text && <button className="link" onClick={copy}>{copied ? 'Copied' : 'Copy answer'}</button>}
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- page ---------- */

function ThemeToggle({ theme, setTheme }) {
  const dark = theme === 'midnight';
  return (
    <button className="toggle" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={() => setTheme(dark ? 'rose' : 'midnight')}>
      <span className="toggle-track"><span className="toggle-knob" /></span>
      <span className="toggle-label">{dark ? 'Dark' : 'Light'}</span>
    </button>
  );
}

export function View({ stats, err, hours, setHours, adminKey, saveKey, theme, setTheme }) {
  const total = stats?.total || 0;
  const windowName = { 1: 'the last hour', 24: 'the last 24 hours', 168: 'the last 7 days' }[hours] || `the last ${hours} hours`;
  return (
    <main>
      <header className="top">
        <div className="brand">
          <h1>LLM Gateway</h1>
          <p>Cache, routing and request monitor</p>
        </div>
        <div className="controls">
          <label className="field"><span>Window</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={1}>Last hour</option><option value={24}>Last 24 hours</option><option value={168}>Last 7 days</option>
            </select>
          </label>
          <label className="field"><span>Admin key</span>
            <input type="password" value={adminKey} onChange={(e) => saveKey(e.target.value)} autoComplete="off" />
          </label>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </header>

      {err && <div className="alert" role="alert">{err}</div>}

      {stats && (
        <>
          <section className="hero" aria-labelledby="hero-h">
            <h2 id="hero-h">{total ? `The cache answered ${fmt(stats.cacheHits)} of ${fmt(total)} requests.` : 'No requests in this window yet.'}</h2>
            <p className="hero-sub">{total ? `Showing ${windowName}. This page refreshes every 5 seconds.` : 'Send a prompt below and it will show up here within a few seconds.'}</p>
            <dl className="stats">
              <div><dt>Requests</dt><dd>{fmt(total)}</dd></div>
              <div><dt>Cache hit rate</dt><dd>{pct(stats.hitRate)}</dd></div>
              <div><dt>Tokens saved</dt><dd>{fmt(stats.tokensSaved)}</dd></div>
              <div><dt>Failed requests</dt><dd>{fmt(stats.errors)}</dd></div>
            </dl>
          </section>

          <div className="charts">
            <section className="panel" aria-labelledby="pie-h">
              <h3 id="pie-h">Where answers came from</h3>
              <p className="sub">Share of {fmt(total)} requests</p>
              <Pie routes={stats.routes} total={total} />
            </section>
            <section className="panel" aria-labelledby="bar-h">
              <h3 id="bar-h">Requests over time</h3>
              <p className="sub">Each bar is one hour</p>
              <BarChart byHour={stats.byHour} />
            </section>
          </div>

          <section className="panel wide" aria-labelledby="lat-h">
            <h3 id="lat-h">How long answers take</h3>
            <p className="sub">Faint bar: the slowest 5% of requests. Solid bar: the typical request.</p>
            <Latency latency={stats.latency} />
          </section>
        </>
      )}

      <TryIt />
    </main>
  );
}

export default function App() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');
  const [hours, setHours] = useState(24);
  const [adminKey, setAdminKey] = useState(() => { try { return sessionStorage.getItem('adminKey') || ''; } catch { return ''; } });
  const [theme, setThemeState] = useState(() => document.documentElement.dataset.theme || 'rose');

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/v1/stats?hours=${hours}`, { headers: adminKey ? { 'x-admin-key': adminKey } : {} });
        if (r.status === 401) throw new Error('Stats are locked. Enter the ADMIN_KEY value from your .env file in the Admin key box.');
        if (!r.ok) throw new Error(`The gateway returned an error for the stats request (status ${r.status}).`);
        setStats(await r.json());
        setErr('');
      } catch (e) { setErr(e.message.startsWith('Stats') || e.message.startsWith('The gateway') ? e.message : `Could not reach the gateway: ${e.message}`); }
    }
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [hours, adminKey]);

  const saveKey = (v) => { setAdminKey(v); try { sessionStorage.setItem('adminKey', v); } catch { /* ignore */ } };
  const setTheme = (t) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('theme', t); } catch { /* ignore */ }
  };

  return <View {...{ stats, err, hours, setHours, adminKey, saveKey, theme, setTheme }} />;
}