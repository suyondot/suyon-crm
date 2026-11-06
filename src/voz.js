// Notas de voz → texto (OpenAI). La asesora lee el texto debajo del audio y el bot / la IA lo entienden.
import { now, clip, localDay } from './util.js';
import { addSpend } from './saldo.js';
import { iaAllowed } from './billetera.js';

export const VOZ_MODEL = 'gpt-4o-mini-transcribe';
export const VOZ_PRICE_MIN = 0.003; // US$ por minuto (aprox.)
export const VOZ_SECRET = 'OPENAI_API_KEY';

// Devuelve el texto o null. Nunca lanza error: si falla, deja el motivo en el mensaje y avisa.
export async function transcribe(env, store, msgId, { notify } = {}) {
  const key = env[VOZ_SECRET];
  if (!key) return null;
  if (!(await iaAllowed(env, store.id)).ok) return null; // sin saldo de IA: el audio queda sin texto
  const m = await env.DB.prepare('SELECT id, chat_id, media_key, media_mime, media_size FROM messages WHERE id = ?').bind(msgId).first();
  if (!m?.media_key) return null;
  try {
    const obj = await env.MEDIA.get(m.media_key);
    if (!obj) throw new Error('El audio no está guardado.');
    if (obj.size > 24 * 1048576) throw new Error('El audio es muy largo para pasarlo a texto.');
    const mime = (m.media_mime || 'audio/ogg').split(';')[0];
    const ext = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'm4a', 'audio/amr': 'amr', 'audio/webm': 'webm', 'audio/wav': 'wav' }[mime] || 'ogg';
    const fd = new FormData();
    fd.append('file', new Blob([await obj.arrayBuffer()], { type: mime }), `nota.${ext}`);
    fd.append('model', VOZ_MODEL);
    fd.append('language', String(store.language || 'es').slice(0, 2));
    fd.append('response_format', 'json');
    const res = await fetch((env.OPENAI_API || 'https://api.openai.com') + '/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Error ${res.status}`);
    const text = clip(String(data.text || '').trim(), 4000);
    if (!text) throw new Error('No se entendió nada en el audio.');
    await env.DB.prepare('UPDATE messages SET transcript = ?, updated_at = ? WHERE id = ?').bind(text, now(), m.id).run();
    await env.DB.prepare("UPDATE chats SET last_preview = ?, updated_at = ? WHERE id = ? AND last_dir = 'in'").bind(clip('🎤 ' + text, 120), now(), m.chat_id).run();
    // Costo aproximado: las notas de voz de WhatsApp (Opus) pesan ~2 KB por segundo
    const min = Math.max(1 / 60, (obj.size || m.media_size || 0) / 2000 / 60);
    await env.DB.prepare(
      `INSERT INTO ia_usage (store_id, day, calls, in_tokens, out_tokens, cost) VALUES (?, ?, 0, 0, 0, ?)
       ON CONFLICT (store_id, day) DO UPDATE SET cost = cost + excluded.cost`
    ).bind(store.id, localDay(now(), store.timezone), min * VOZ_PRICE_MIN).run();
    await addSpend(env, 'openai', min * VOZ_PRICE_MIN, store.timezone, store.id);
    await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
    return text;
  } catch (e) {
    await env.DB.prepare('UPDATE messages SET transcript = NULL, error = ?, updated_at = ? WHERE id = ?').bind(clip('Nota de voz sin texto: ' + e.message, 300), now(), m.id).run();
    if (notify) await notify(env, store.id, { kind: 'error', chatId: m.chat_id, title: 'No se pudo pasar a texto una nota de voz', body: `${e.message} La asesora puede escucharla en el chat.` }).catch(() => {});
    return null;
  }
}
