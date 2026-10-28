{ // bloc isolé : aucune variable ne fuit vers les autres cartes
/*
 * Temperature Overview Card (FR)
 * Carte Home Assistant « suivi des températures » : zones (nuit, jour, technique…) avec, pour chaque capteur,
 * la valeur colorée, les min/max et une courbe d'historique. Responsive : une colonne en portrait sur
 * smartphone, plusieurs colonnes en paysage sur tablette. Style verre, thème clair/sombre, éditeur visuel.
 */

const CARD_VERSION = "1.1.0";

/* === NUANCE COMMUNE v2 (cartes Johan854) ===
 * Bloc identique dans toutes les cartes. Options : nuance, nuance_perso, intensite.
 * nuance "theme" (par défaut) : suit la variable carte-nuance du thème Home Assistant ;
 * si elle n'existe pas, la carte garde ses couleurs d'origine. Intensité : 0 = neutre, 1 = normal, 2 = très coloré. */
const GV_NUANCES = [["braise", "Braise (rouge)", "#e0524f"], ["ocean", "Océan (bleu)", "#2f8fd8"], ["lagon", "Lagon (turquoise)", "#1fb5a8"], ["foret", "Forêt (vert)", "#3fae5a"], ["lavande", "Lavande (violet)", "#8a63d8"], ["framboise", "Framboise (rose)", "#e05597"], ["ambre", "Ambre (orange)", "#e8902c"], ["ardoise", "Ardoise (neutre)", "#7d8595"]];
const GV_DEFAULTS = { nuance: "theme", intensite: 1 };
const gvAccent = (c) => {
  const p = c && c.nuance_perso;
  if (c && c.nuance === "perso") {
    if (Array.isArray(p) && p.length === 3) return "#" + p.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, "0")).join("");
    if (typeof p === "string" && /^#?[0-9a-f]{6}$/i.test(p.trim())) return "#" + p.trim().replace("#", "");
  }
  const n = GV_NUANCES.find((x) => x[0] === (c && c.nuance));
  return n ? n[2] : "var(--carte-nuance)";
};
/* Variables posées sur <ha-card> : --g-bg-x (fond dégradé teinté) et --acc-ui-x (couleur d'accent).
 * Sans nuance (thème sans carte-nuance), elles sont invalides : chaque carte retombe alors sur ses couleurs d'origine. */
const gvStyle = (c, dark) => {
  const i = Number(c && c.intensite), ai = Number.isFinite(i) ? Math.max(0, Math.min(2, i)) : 1;
  const m = (pct, base) => `color-mix(in srgb,var(--acc-ui) ${+(pct * ai).toFixed(1)}%,${base})`;
  const bg = dark ? `linear-gradient(160deg,${m(5, "#1b1e32")} 0%,${m(11, "#1f1b2c")} 55%,${m(22, "#1c1620")} 100%)`
    : `linear-gradient(160deg,${m(2, "#f8f9fd")} 0%,${m(5, "#eef1f8")} 55%,${m(11, "#f8f8fa")} 100%)`;
  return `--acc-ui:${gvAccent(c)};--g-bg-x:${bg};--acc-ui-x:color-mix(in srgb,var(--acc-ui) ${dark ? "80%,#fff" : "82%,#000"})`;
};
const GV_FIELDS = [
  { name: "nuance", selector: { select: { mode: "dropdown", options: [{ value: "theme", label: "Selon le thème (couleurs d'origine)" }, ...GV_NUANCES.map((n) => ({ value: n[0], label: n[1] })), { value: "perso", label: "Personnalisée" }] } } },
  { name: "nuance_perso", selector: { color_rgb: {} } },
  { name: "intensite", selector: { number: { min: 0, max: 2, step: 0.1, mode: "slider" } } }];
const GV_LABELS = { nuance: "Nuance de couleur", nuance_perso: "Couleur personnalisée (nuance « Personnalisée »)", intensite: "Intensité de la nuance" };
/* === FIN NUANCE COMMUNE === */

const DEFAULTS = {
  title: "",
  theme: "auto", nuance: "theme", intensite: 1, // auto | light | dark
  columns: 0, // zones par ligne (0 = automatique selon la largeur)
  hours_to_show: 24,
  show_graph: true,
  show_minmax: true,
  comfort_min: 19, // en dessous : froid (bleu)
  comfort_max: 23, // au-dessus : chaud (orange)
  zones: [],
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = (v) => v !== undefined && v !== null && v !== "" && !isNaN(Number(v));
const bad = (st) => !st || st.state === "unavailable" || st.state === "unknown" || !isNum(st.state);

class TemperatureOverviewCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("temperature-overview-card-editor");
  }

  static getStubConfig() {
    return { ...DEFAULTS, title: "Suivi des températures", zones: [{ title: "Zone", sensors: [] }] };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = "";
    this._hist = {};
    this._histAt = 0;
    this._loading = false;
  }

  setConfig(config) {
    if (!config) throw new Error("Configuration invalide");
    this._config = { ...DEFAULTS, ...config };
    if (!Array.isArray(this._config.zones)) this._config.zones = [];
    this._hist = {};
    this._histAt = 0;
    this._sig = "";
    if (this._hass) { this._render(); this._loadHistory(); }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const sig = this._entities().map((e) => { const s = hass.states[e]; return s ? s.state : "x"; }).join("|") + "#" + (this._isDark() ? "d" : "l");
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
    if (this._config.show_graph && Date.now() - this._histAt > 10 * 60 * 1000) this._loadHistory();
  }

  getCardSize() { return 6; }

  _entities() {
    const out = [];
    this._config.zones.forEach((z) => (z.sensors || []).forEach((s) => { if (s.entity) out.push(s.entity); }));
    return out;
  }

  _isDark() {
    const t = this._config && this._config.theme;
    if (t === "dark") return true;
    if (t === "light") return false;
    const dm = this._hass && this._hass.themes && this._hass.themes.darkMode;
    if (typeof dm === "boolean") return dm;
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  _fmt(n, d) {
    const lang = (this._hass && this._hass.locale && this._hass.locale.language) || "fr";
    return new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n));
  }

  _more(id) {
    if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } }));
  }

  async _loadHistory() {
    if (this._loading || !this._config.show_graph || !this._hass || !this._hass.callWS) return;
    const ids = [...new Set(this._entities())];
    if (!ids.length) return;
    this._loading = true;
    this._histAt = Date.now();
    try {
      const end = new Date();
      const start = new Date(end.getTime() - Number(this._config.hours_to_show || 24) * 3600e3);
      const res = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      const hist = {};
      Object.keys(res || {}).forEach((eid) => {
        hist[eid] = res[eid]
          .map((p) => {
            const t = p.lu !== undefined ? p.lu * 1000 : p.lc !== undefined ? p.lc * 1000 : new Date(p.last_updated || p.last_changed).getTime();
            return [t, Number(p.s !== undefined ? p.s : p.state)];
          })
          .filter((p) => isFinite(p[0]) && isFinite(p[1]));
      });
      this._hist = hist;
      this._rangeStart = start.getTime();
      this._rangeEnd = end.getTime();
      this._sig = "";
      this._render();
    } catch (e) {
      this._histAt = Date.now() - 9 * 60 * 1000; // nouvel essai dans ~1 min
    } finally {
      this._loading = false;
    }
  }

  _tone(item, zone, v) {
    const c = this._config;
    const sev = item.severity;
    if (sev && (isNum(sev.yellow) || isNum(sev.red))) {
      if (isNum(sev.red) && v >= Number(sev.red)) return "err";
      if (isNum(sev.yellow) && v >= Number(sev.yellow)) return "warn";
      return "ok";
    }
    const colorize = item.color !== undefined ? item.color !== false : zone.color !== false;
    if (!colorize) return "neutral";
    if (v < Number(c.comfort_min)) return "cold";
    if (v > Number(c.comfort_max)) return "hot";
    return "ok";
  }

  _spark(eid, tone) {
    const pts = this._hist[eid];
    if (!pts || pts.length < 2) return `<span class="sp none"></span>`;
    const t0 = this._rangeStart || pts[0][0], t1 = this._rangeEnd || pts[pts.length - 1][0];
    const vs = pts.map((p) => p[1]);
    let mn = Math.min(...vs), mx = Math.max(...vs);
    if (mx - mn < 1) { const mid = (mx + mn) / 2; mn = mid - 0.5; mx = mid + 0.5; }
    const W = 100, H = 30, pad = 2;
    const x = (t) => ((t - t0) / (t1 - t0 || 1)) * W;
    const y = (v) => H - pad - ((v - mn) / (mx - mn)) * (H - pad * 2);
    let d = "";
    pts.forEach((p, i) => { d += (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1) + " "; });
    const last = pts[pts.length - 1];
    d += "L" + W + " " + y(last[1]).toFixed(1);
    const area = d + `L${W} ${H} L${x(pts[0][0]).toFixed(1)} ${H}Z`;
    return `<svg class="sp ${tone}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${area}" class="ar"/><path d="${d}" class="ln" vector-effect="non-scaling-stroke"/></svg>`;
  }

  _row(item, zone) {
    const c = this._config, h = this._hass;
    const st = h.states[item.entity];
    const name = item.name || (st && st.attributes.friendly_name) || item.entity;
    if (bad(st)) {
      return `<button class="row na" data-more="${esc(item.entity)}"><span class="nm">${esc(name)}</span><span class="vl">—</span></button>`;
    }
    const v = Number(st.state);
    const unit = st.attributes.unit_of_measurement || "°C";
    const tone = this._tone(item, zone, v);
    const pts = this._hist[item.entity];
    let mm = "";
    if (c.show_minmax && pts && pts.length) {
      const vs = pts.map((p) => p[1]);
      mm = `<span class="mm">${this._fmt(Math.min(...vs), 1)} – ${this._fmt(Math.max(...vs), 1)}</span>`;
    }
    // Jauge (ex. congélateur) : repère entre min et max
    let gauge = "";
    if (isNum(item.min) && isNum(item.max)) {
      const mn = Number(item.min), mx = Number(item.max);
      const pct = Math.max(0, Math.min(100, ((v - mn) / (mx - mn || 1)) * 100));
      gauge = `<span class="g"><i class="gb ${tone}"><u style="left:${pct}%"></u></i><span class="gl"><span>${this._fmt(mn, 0)}</span><span>${this._fmt(mx, 0)}</span></span></span>`;
    }
    return `<button class="row ${tone}" data-more="${esc(item.entity)}" title="${esc(name)}">
      <span class="nm"><span class="n">${esc(name)}</span>${mm}</span>
      ${c.show_graph && !gauge ? this._spark(item.entity, tone) : ""}
      <span class="vl">${this._fmt(v, Math.abs(v) >= 100 ? 0 : 1)}<small>${esc(unit)}</small></span>
      ${gauge}
    </button>`;
  }

  _render() {
    const c = this._config;
    if (!c || !this._hass) return;
    const dark = this._isDark();
    const cols = Number(c.columns) > 0 ? Number(c.columns) : 0;
    const zones = c.zones.map((z) => `
      <section class="zone">
        <h3>${esc(z.title || "")}</h3>
        <div class="rows">${(z.sensors || []).filter((s) => s.entity).map((s) => this._row(s, z)).join("") || `<div class="empty">Aucun capteur</div>`}</div>
      </section>`).join("");

    this.shadowRoot.innerHTML = `
      <style>
        * { box-sizing:border-box; }
        ha-card.dark {
          --tp-text:#f4f6fb; --tp-muted:#a9afc0; --tp-bg:var(--g-bg-x,linear-gradient(160deg,#1b1e32 0%,#241a2a 55%,#2d1519 100%));
          --tp-border:rgba(255,255,255,.14); --tp-shadow:0 .6em 2em rgba(0,0,0,.35);
          --tp-glass:rgba(255,255,255,.07); --tp-glass-b:rgba(255,255,255,.13); --tp-fill:rgba(255,255,255,.09);
          --tp-cold:#5ab4ff; --tp-ok:#3ddc84; --tp-hot:#ff9a4d; --tp-warn:#ffd166; --tp-err:#ff5a5f; --tp-neutral:#b9a7ff;
        }
        ha-card.light {
          --tp-text:#1c2030; --tp-muted:#5d6477; --tp-bg:var(--g-bg-x,linear-gradient(160deg,#f8f9fd 0%,#eef1f8 55%,#f8eff0 100%));
          --tp-border:rgba(20,24,40,.12); --tp-shadow:0 .4em 1.4em rgba(20,24,40,.12);
          --tp-glass:rgba(255,255,255,.7); --tp-glass-b:rgba(20,24,40,.1); --tp-fill:rgba(20,24,40,.06);
          --tp-cold:#1a76d2; --tp-ok:#1a9d55; --tp-hot:#d9650f; --tp-warn:#b78500; --tp-err:#d32f35; --tp-neutral:#6c52d9;
        }
        ha-card { container-type:inline-size; display:flex; flex-direction:column; gap:12px; padding:14px; color:var(--tp-text);
          border-radius:24px; border:1px solid var(--tp-border); background:var(--tp-bg); box-shadow:var(--tp-shadow); overflow:hidden; }
        button { font:inherit; color:inherit; cursor:pointer; border:0; background:none; padding:0; text-align:left; -webkit-tap-highlight-color:transparent; }
        h2 { margin:0; font-size:1.1em; font-weight:650; }
        .zones { display:grid; gap:12px; align-items:start;
          grid-template-columns:${cols ? `repeat(${cols},minmax(0,1fr))` : "repeat(auto-fit,minmax(min(100%,12.5em),1fr))"}; }
        .zone { padding:12px; border-radius:18px; background:var(--tp-glass); border:1px solid var(--tp-glass-b); min-width:0;
          -webkit-backdrop-filter:blur(18px) saturate(140%); backdrop-filter:blur(18px) saturate(140%); }
        h3 { margin:0 0 6px; font-size:.95em; font-weight:650; }
        .rows { display:flex; flex-direction:column; }
        .row { display:grid; grid-template-columns:minmax(0,1fr) 3em auto; align-items:center; gap:.6em; padding:.55em .2em; border-top:1px solid var(--tp-glass-b); width:100%; }
        .row:first-child { border-top:0; }
        .nm { display:flex; flex-direction:column; min-width:0; }
        .n { font-size:.88em; font-weight:600; line-height:1.15; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; }
        .mm { font-size:.7em; color:var(--tp-muted); font-variant-numeric:tabular-nums; }
        .vl { font-size:1.15em; font-weight:700; font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap; }
        .vl small { font-size:.62em; font-weight:600; color:var(--tp-muted); margin-left:.15em; }
        .row.cold .vl { color:var(--tp-cold); } .row.ok .vl { color:var(--tp-ok); } .row.hot .vl { color:var(--tp-hot); }
        .row.warn .vl { color:var(--tp-warn); } .row.err .vl { color:var(--tp-err); } .row.neutral .vl { color:var(--tp-text); }
        .row.na { opacity:.5; grid-template-columns:1fr auto; }
        .sp { width:100%; height:1.9em; display:block; } .sp.none { visibility:hidden; }
        .sp .ln { fill:none; stroke:var(--tp-line,var(--tp-neutral)); stroke-width:1.6; stroke-linejoin:round; stroke-linecap:round; }
        .sp .ar { fill:var(--tp-line,var(--tp-neutral)); opacity:.14; }
        .sp.cold { --tp-line:var(--tp-cold); } .sp.ok { --tp-line:var(--tp-ok); } .sp.hot { --tp-line:var(--tp-hot); }
        .sp.warn { --tp-line:var(--tp-warn); } .sp.err { --tp-line:var(--tp-err); } .sp.neutral { --tp-line:var(--tp-neutral); }
        .row:has(.g) { grid-template-columns:minmax(0,1fr) auto; }
        .g { grid-column:1 / -1; display:flex; flex-direction:column; gap:.2em; }
        .gb { position:relative; display:block; height:.5em; border-radius:.3em; background:var(--tp-fill); overflow:visible; }
        .gb.ok { background:linear-gradient(90deg, color-mix(in srgb, var(--tp-ok) 45%, transparent), var(--tp-fill)); }
        .gb.warn { background:linear-gradient(90deg, color-mix(in srgb, var(--tp-warn) 45%, transparent), var(--tp-fill)); }
        .gb.err { background:linear-gradient(90deg, color-mix(in srgb, var(--tp-err) 55%, transparent), var(--tp-fill)); }
        .gb u { position:absolute; top:-.25em; width:.3em; height:1em; margin-left:-.15em; border-radius:.2em; background:var(--tp-text); text-decoration:none; }
        .gl { display:flex; justify-content:space-between; font-size:.68em; color:var(--tp-muted); }
        .empty { color:var(--tp-muted); font-size:.85em; padding:.4em 0; }
        @container (max-width:420px) { ha-card { padding:10px; } .zone { padding:10px; } }
      </style>
      <ha-card class="${dark ? "dark" : "light"}" style="${gvStyle(this._config, dark)}">
        ${c.title ? `<h2>${esc(c.title)}</h2>` : ""}
        <div class="zones">${zones || `<div class="empty">Ajoutez une zone dans l'éditeur de la carte.</div>`}</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => el.addEventListener("click", () => this._more(el.dataset.more)));
  }
}

/* ---------- Éditeur visuel ---------- */
const LABELS = { ...GV_LABELS,
  title: "Titre", theme: "Thème", columns: "Zones par ligne (0 = automatique)", hours_to_show: "Historique (heures)",
  show_graph: "Afficher les courbes", show_minmax: "Afficher min / max", comfort_min: "Froid en dessous de (°)", comfort_max: "Chaud au-dessus de (°)",
  entity: "Capteur", name: "Nom (facultatif)", color: "Colorer selon le confort", min: "Jauge : minimum", max: "Jauge : maximum",
  yellow: "Jauge : orange à partir de", red: "Jauge : rouge à partir de",
};
const num = (name, min, max, step = 1) => ({ name, selector: { number: { min, max, step, mode: "box" } } });
const MAIN_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { type: "grid", name: "", schema: [
    { name: "theme", selector: { select: { mode: "dropdown", options: [
      { value: "auto", label: "Automatique (thème de Home Assistant)" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" } ] } } }, ...GV_FIELDS,
    num("columns", 0, 6), num("hours_to_show", 1, 168),
  ] },
  { type: "grid", name: "", schema: [num("comfort_min", -30, 40, 0.5), num("comfort_max", -30, 40, 0.5)] },
  { type: "grid", name: "", schema: [{ name: "show_graph", selector: { boolean: {} } }, { name: "show_minmax", selector: { boolean: {} } }] },
];
const ZONE_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "color", selector: { boolean: {} } },
];
const SENSOR_SCHEMA = [
  { name: "entity", selector: { entity: { domain: "sensor" } } },
  { name: "name", selector: { text: {} } },
  { type: "expandable", title: "Options avancées (couleur, jauge)", name: "", schema: [
    { name: "color", selector: { boolean: {} } },
    { type: "grid", name: "", schema: [num("min", -100, 200), num("max", -100, 200)] },
    { type: "grid", name: "", schema: [num("yellow", -100, 200), num("red", -100, 200)] },
  ] },
];

class TemperatureOverviewCardEditor extends HTMLElement {
  _sig(cfg) { return cfg.zones.map((z) => (z.sensors || []).length).join(","); }

  setConfig(config) {
    const next = { ...DEFAULTS, ...config, zones: (config.zones || []).map((z) => ({ ...z, sensors: (z.sensors || []).map((s) => ({ ...s })) })) };
    const same = this._config && this._built && this._sig(next) === this._sig(this._config);
    this._config = next;
    if (!same) return this._build();
    // même structure : mise à jour des données seulement (garde le focus pendant la saisie)
    this._forms.forEach((f) => { f.el.data = f.get(this._config); });
  }

  set hass(hass) {
    this._hass = hass;
    (this._forms || []).forEach((f) => (f.el.hass = hass));
  }

  _emit() {
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
  }

  _form(schema, get, set, parent) {
    const el = document.createElement("ha-form");
    el.hass = this._hass;
    el.data = get(this._config);
    el.computeLabel = (s) => LABELS[s.name] || s.name;
    el.schema = schema;
    el.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      set(this._config, ev.detail.value);
      this._emit();
    });
    this._forms.push({ el, get });
    parent.appendChild(el);
    return el;
  }

  _build() {
    this._built = true;
    this._forms = [];
    this.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `.bx{border:1px solid var(--divider-color);border-radius:12px;padding:10px;margin:12px 0}
      .sx{border:1px dashed var(--divider-color);border-radius:10px;padding:8px;margin:10px 0}
      .h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:600}
      .bx button,.add{cursor:pointer;border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);border-radius:8px;padding:6px 10px}
      .add{width:100%;margin:4px 0 8px}`;
    this.appendChild(style);

    this._form(MAIN_SCHEMA, (c) => c, (c, v) => { const z = c.zones; Object.assign(c, v); c.zones = z; }, this);

    this._config.zones.forEach((z, zi) => {
      const box = document.createElement("div");
      box.className = "bx";
      box.innerHTML = `<div class="h"><span>Zone ${zi + 1}</span><span><button data-zk="up" data-zi="${zi}">↑</button> <button data-zk="down" data-zi="${zi}">↓</button> <button data-zk="del" data-zi="${zi}">✕</button></span></div>`;
      this._form(ZONE_SCHEMA, (c) => c.zones[zi], (c, v) => { c.zones[zi] = { ...v, sensors: c.zones[zi].sensors }; }, box);
      (z.sensors || []).forEach((s, si) => {
        const sb = document.createElement("div");
        sb.className = "sx";
        sb.innerHTML = `<div class="h"><span>Capteur ${si + 1}</span><span><button data-sk="up" data-zi="${zi}" data-si="${si}">↑</button> <button data-sk="down" data-zi="${zi}" data-si="${si}">↓</button> <button data-sk="del" data-zi="${zi}" data-si="${si}">✕</button></span></div>`;
        this._form(SENSOR_SCHEMA, (c) => { const t = c.zones[zi].sensors[si]; return { ...t, yellow: t.severity && t.severity.yellow, red: t.severity && t.severity.red }; }, (c, v) => { c.zones[zi].sensors[si] = this._clean(v); }, sb);
        box.appendChild(sb);
      });
      const add = document.createElement("button");
      add.className = "add"; add.textContent = "+ Ajouter un capteur"; add.dataset.addS = zi;
      box.appendChild(add);
      this.appendChild(box);
    });
    const addZ = document.createElement("button");
    addZ.className = "add"; addZ.textContent = "+ Ajouter une zone"; addZ.dataset.addZ = "1";
    this.appendChild(addZ);

    this.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => this._click(b)));
  }

  _clean(v) {
    const o = { ...v };
    ["min", "max", "yellow", "red"].forEach((k) => { if (o[k] === "" || o[k] === null || o[k] === undefined) delete o[k]; });
    if (isNum(o.yellow) || isNum(o.red)) o.severity = { ...(isNum(o.yellow) ? { yellow: Number(o.yellow) } : {}), ...(isNum(o.red) ? { red: Number(o.red) } : {}) };
    else delete o.severity;
    delete o.yellow; delete o.red;
    return o;
  }

  _click(b) {
    const cfg = this._config, d = b.dataset;
    const move = (arr, i, dir) => { const j = i + dir; if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]]; };
    if (d.addZ) cfg.zones.push({ title: "", sensors: [] });
    else if (d.addS !== undefined) cfg.zones[Number(d.addS)].sensors.push({ entity: "" });
    else if (d.zk) { const i = Number(d.zi); d.zk === "del" ? cfg.zones.splice(i, 1) : move(cfg.zones, i, d.zk === "up" ? -1 : 1); }
    else if (d.sk) { const arr = cfg.zones[Number(d.zi)].sensors, i = Number(d.si); d.sk === "del" ? arr.splice(i, 1) : move(arr, i, d.sk === "up" ? -1 : 1); }
    else return;
    this._emit();
    this._build();
  }
}

customElements.define("temperature-overview-card", TemperatureOverviewCard);
customElements.define("temperature-overview-card-editor", TemperatureOverviewCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "temperature-overview-card",
  name: "Temperature Overview Card (FR)",
  description: "Suivi des températures par zones, avec courbes, min/max et affichage adapté au smartphone et à la tablette.",
  preview: true,
});

console.info(
  `%c TEMPERATURE-OVERVIEW-CARD %c v${CARD_VERSION} `,
  "color:#fff;background:#d9650f;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px",
  "color:#d9650f;background:#fff;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px"
);
}
