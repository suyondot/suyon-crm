// Agenda de demos: horarios que Jordan abre en el Panel y reservas desde la página pública
import { now, fail, localParts, tzOffset, validTz, DEFAULT_TZ } from './util.js';

const H = 36e5;
export const DEFAULT_AGENDA = {
  on: 1,
  tz: DEFAULT_TZ,
  days: [1, 2, 3, 4, 5], // 0 domingo … 6 sábado
  from: '10:00',
  to: '18:00',
  pausa_from: '13:00', // almuerzo (vacío = sin pausa)
  pausa_to: '14:00',
  slot_min: 30,
  dur_min: 30,
  min_hours: 3, // con cuánta anticipación se puede reservar
  max_days: 14,
  off_dates: '', // fechas sin demos: 2026-12-25, 2026-12-31
  where: 'Videollamada por Google Meet (te mando el enlace por WhatsApp)',
};
export const DEMO_STATUS = ['nueva', 'confirmada', 'hecha', 'no_vino', 'cancelada'];
const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const hm = (s) => {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
};
const pad = (n) => String(n).padStart(2, '0');

export async function loadAgenda(env) {
  const r = await env.DB.prepare("SELECT value FROM platform_settings WHERE key = 'agenda'").first().catch(() => null);
  let saved = {};
  try {
    saved = r ? JSON.parse(r.value) : {};
  } catch {}
  return { ...DEFAULT_AGENDA, ...saved };
}

export async function saveAgenda(env, patch) {
  const cur = await loadAgenda(env);
  const next = { ...cur };
  const int = (v, d, min, max) => (Number.isFinite(Number(v)) ? Math.min(Math.max(Math.round(Number(v)), min), max) : d);
  if ('on' in patch) next.on = patch.on ? 1 : 0;
  if ('tz' in patch && validTz(patch.tz)) next.tz = patch.tz;
  if ('days' in patch) next.days = [...new Set((Array.isArray(patch.days) ? patch.days : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  for (const k of ['from', 'to']) if (k in patch && hm(patch[k]) !== null) next[k] = patch[k].padStart(5, '0');
  for (const k of ['pausa_from', 'pausa_to']) if (k in patch) next[k] = hm(patch[k]) !== null ? patch[k].padStart(5, '0') : '';
  if ('slot_min' in patch) next.slot_min = int(patch.slot_min, cur.slot_min, 15, 120);
  if ('dur_min' in patch) next.dur_min = int(patch.dur_min, cur.dur_min, 15, 120);
  if ('min_hours' in patch) next.min_hours = int(patch.min_hours, cur.min_hours, 0, 72);
  if ('max_days' in patch) next.max_days = int(patch.max_days, cur.max_days, 1, 60);
  if ('off_dates' in patch) next.off_dates = (String(patch.off_dates || '').match(/\d{4}-\d{2}-\d{2}/g) || []).join(', ');
  if ('where' in patch) next.where = String(patch.where || '').trim().slice(0, 300);
  if (hm(next.to) <= hm(next.from)) fail(400, 'La hora de fin debe ser después de la hora de inicio.');
  await env.DB.prepare("INSERT INTO platform_settings (key, value, updated_at) VALUES ('agenda', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(next), now()).run();
  return next;
}

// Hora local (de la agenda) → milisegundos UTC
function localToUtc(y, mo, d, minutes, tz) {
  const guess = Date.UTC(y, mo - 1, d, 0, minutes);
  return guess - tzOffset(guess - tzOffset(guess, tz), tz);
}

export function dayLabel(t, tz = DEFAULT_TZ) {
  const p = localParts(t, tz);
  return `${DOW[p.dow]} ${p.d} de ${MES[p.mo - 1]}`;
}
export function timeLabel(t, tz = DEFAULT_TZ) {
  const p = localParts(t, tz);
  const h12 = p.h % 12 || 12;
  return `${h12}:${pad(p.m)} ${p.h < 12 ? 'a. m.' : 'p. m.'}`;
}

// Días con horarios libres
export async function freeSlots(env, ag, t = now()) {
  if (!ag.on) return [];
  const tz = ag.tz;
  const from = hm(ag.from);
  const to = hm(ag.to);
  const pf = hm(ag.pausa_from);
  const pt = hm(ag.pausa_to);
  const off = new Set(String(ag.off_dates || '').split(/[\s,]+/).filter(Boolean));
  const end = t + (ag.max_days + 1) * 24 * H;
  const { results } = await env.DB.prepare("SELECT starts_at, dur_min FROM demos WHERE status != 'cancelada' AND starts_at >= ? AND starts_at < ?").bind(t - 3 * H, end).all();
  const busy = results.map((r) => [r.starts_at, r.starts_at + (r.dur_min || 30) * 6e4]);
  const earliest = t + ag.min_hours * H;
  const out = [];
  for (let i = 0; i <= ag.max_days; i++) {
    const p = localParts(t + i * 24 * H, tz);
    const date = `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
    if (!ag.days.includes(p.dow) || off.has(date)) continue;
    const slots = [];
    for (let m = from; m + ag.dur_min <= to; m += ag.slot_min) {
      if (pf !== null && pt !== null && m < pt && m + ag.dur_min > pf) continue;
      const s = localToUtc(p.y, p.mo, p.d, m, tz);
      const e = s + ag.dur_min * 6e4;
      if (s < earliest) continue;
      if (busy.some(([a, b]) => s < b && e > a)) continue;
      slots.push({ t: s, hora: timeLabel(s, tz) });
    }
    if (slots.length) out.push({ date, label: dayLabel(localToUtc(p.y, p.mo, p.d, 720, tz), tz), dow: p.dow, d: p.d, slots });
  }
  return out;
}

export function cleanPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (/^9\d{8}$/.test(d)) d = `51${d}`; // celular peruano sin código
  return d.length >= 10 && d.length <= 15 ? d : null;
}

const gstamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function gcalLink({ title, start, mins, details, where }) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${gstamp(start)}/${gstamp(start + mins * 6e4)}`, details: details || '', location: where || '' });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// Reserva pública
export async function bookDemo(env, ag, b) {
  if (!ag.on) fail(403, 'Por ahora no hay demos disponibles. Escríbenos por WhatsApp.');
  if (b.website) fail(400, 'No se pudo agendar.'); // trampa para robots
  const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const phone = cleanPhone(b.phone);
  if (!name) fail(400, 'Escribe tu nombre.');
  if (!phone) fail(400, 'Escribe tu WhatsApp con código de país (ej. 51 987 654 321).');
  const t = Number(b.t);
  const days = await freeSlots(env, ag);
  if (!days.some((d) => d.slots.some((s) => s.t === t))) fail(409, 'Ese horario ya no está libre. Elige otro.');
  const db = env.DB;
  const ya = await db.prepare("SELECT starts_at FROM demos WHERE phone = ? AND status IN ('nueva','confirmada') AND starts_at > ? ORDER BY starts_at LIMIT 1").bind(phone, now()).first();
  if (ya) fail(409, `Ya tienes una demo el ${dayLabel(ya.starts_at, ag.tz)} a las ${timeLabel(ya.starts_at, ag.tz)}. Si quieres cambiarla, escríbenos por WhatsApp.`);
  const tt = now();
  const clip = (v, n) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, n) || null;
  const r = await db.prepare('INSERT INTO demos (starts_at, dur_min, name, phone, brand, sells, volume, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(t, ag.dur_min, name, phone, clip(b.brand, 80), clip(b.sells, 120), clip(b.volume, 40), clip(b.note, 400), 'nueva', tt, tt).run();
  return {
    id: r.meta.last_row_id,
    t,
    dur_min: ag.dur_min,
    dia: dayLabel(t, ag.tz),
    hora: timeLabel(t, ag.tz),
    where: ag.where,
    gcal: gcalLink({ title: 'Demo de Control Total', start: t, mins: ag.dur_min, details: 'Te mostramos cómo vender ropa por WhatsApp en automático con Control Total.', where: ag.where }),
  };
}
