// Corrige mayúsculas, tildes y puntuación de lo que escribe el equipo antes de mandarlo a la clienta.
// Regla de oro: solo se aceptan cambios que NO cambian las palabras (mismo texto sin tildes, sin mayúsculas y sin signos).
// Si la IA tarda, falla o cambia alguna palabra, se manda tal cual lo escribió la asesora.
import { now, localDay } from './util.js';

const MODEL = 'claude-haiku-5-5';
const PROMPT = `Corrige la ortografía de este mensaje de WhatsApp en español peruano que una vendedora le escribe a una clienta.
Solo puedes: poner mayúsculas donde van, poner tildes que faltan (qué/que, está/esta, sí/si, más/mas, tú/tu según el sentido), agregar o quitar comas y puntos, y agregar ¿ ¡ al inicio de preguntas y exclamaciones.
NO cambies, agregues, quites ni reordenes palabras. NO cambies emojis, números, montos, nombres de colores, tallas ni saltos de línea. No pongas punto final si el mensaje termina en emoji o en pregunta.
Responde SOLO con el mensaje corregido, sin comillas ni explicaciones.`;

// Lo que debe quedar igual: letras y números, sin tildes ni mayúsculas
export const skeleton = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\p{Extended_Pictographic}]+/gu, ' ').trim();

export async function fixSpelling(env, store, text) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key || !text || text.length < 3 || text.length > 1500) return text;
  if (/https?:\/\/|www\.|@\w|\{|\}/i.test(text)) return text; // enlaces, correos o variables: no se tocan
  if (!/[a-záéíóúñ]{2}/i.test(text)) return text; // solo emojis o números
  let out = '';
  try {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 3500);
    const res = await fetch((env.ANTHROPIC_API || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: Math.min(1200, 60 + text.length), system: PROMPT, messages: [{ role: 'user', content: `<mensaje>\n${text}\n</mensaje>` }] }),
    });
    clearTimeout(tm);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return text;
    out = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').replace(/^\s*<mensaje>\s*|\s*<\/mensaje>\s*$/g, '').trim();
    const inTok = data.usage?.input_tokens || 0;
    const outTok = data.usage?.output_tokens || 0;
    await env.DB.prepare(
      `INSERT INTO ia_usage (store_id, day, calls, in_tokens, out_tokens, cost) VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT (store_id, day) DO UPDATE SET calls = calls + 1, in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens, cost = cost + excluded.cost`
    ).bind(store.id, localDay(now(), store.timezone || 'America/Lima'), inTok, outTok, (inTok * 0.1 + outTok * 0.5) / 1e6).run().catch(() => {});
  } catch {
    return text;
  }
  if (!out || out.length > text.length * 1.3 + 10) return text;
  if (skeleton(out) !== skeleton(text)) return text; // cambió alguna palabra: se manda lo original
  // Saltos de línea: deben ser los mismos
  if ((out.match(/\n/g) || []).length !== (text.match(/\n/g) || []).length) return text;
  return out;
}
