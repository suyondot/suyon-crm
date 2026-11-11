// Pedido de Shopify que va por Shalom: después de que la clienta toca «Sí, confirmo» se le piden, con mensajes
// normales (ventana de 24 h abierta, no plantillas): DNI (si falta) → agencia Shalom (lista para tocar) → adelanto por Yape.
// La captura cae en Pagos para que el equipo la confirme. El paso va en chats.bot_vars.__shp.
import { now, clip } from './util.js';
import { sendText, sendList } from './whatsapp.js';
import { notify, loadSettings, addLabel, botSend } from './bot.js';
import { cfgOf, addEvent, getOrder, shape } from './orders.js';
import { agenciesNear, agenciesIn, agencyOptions } from './shalom.js';

const money = (n) => `S/${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

async function getVars(env, chatId) {
  const r = await env.DB.prepare('SELECT bot_vars FROM chats WHERE id = ?').bind(chatId).first();
  try {
    return JSON.parse(r?.bot_vars || '{}') || {};
  } catch {
    return {};
  }
}
async function setPaso(env, chatId, st) {
  const v = await getVars(env, chatId);
  if (st) v.__shp = st;
  else delete v.__shp;
  await env.DB.prepare('UPDATE chats SET bot_vars = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(v), now(), chatId).run();
}

// Manda y guarda el mensaje en el chat
async function out(env, store, chat, body, { list } = {}) {
  if (store.status !== 'activo') return;
  let wamid = null;
  try {
    wamid = list ? await sendList(env, store, chat.wa_id, body, list.button, list.rows) : await sendText(env, store, chat.wa_id, body);
  } catch (e) {
    await notify(env, store.id, { kind: 'error', chatId: chat.id, title: 'No se pudo mandar el paso de provincia', body: e.message });
    return;
  }
  const t = now();
  const extra = list ? JSON.stringify({ opciones: list.rows.map((r) => r.title), boton: list.button, auto: 'provincia' }) : JSON.stringify({ auto: 'provincia' });
  await env.DB.prepare(`INSERT INTO messages (chat_id, store_id, wamid, direction, sender, type, body, status, extra, created_at, updated_at) VALUES (?, ?, ?, 'out', 'bot', ?, ?, 'sent', ?, ?, ?)`)
    .bind(chat.id, store.id, wamid, list ? 'interactive' : 'text', body, extra, t, t).run();
  await env.DB.prepare("UPDATE chats SET last_msg_at = ?, last_preview = ?, last_dir = 'out', updated_at = ? WHERE id = ?").bind(t, clip(body.split('\n')[0], 120), t, chat.id).run();
  await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
}

// Algo que el bot no entiende: lo ve la asesora
export async function aAsesora(env, store, chat, order, why) {
  // Sin bot (para no gastar): queda para que la asesora la atienda o la llame
  await addLabel(env, store.id, chat.id, 'ATENDER PENDIENTE');
  await env.DB.prepare('UPDATE chats SET unread = MAX(unread, 1), updated_at = ? WHERE id = ?').bind(now(), chat.id).run();
  await notify(env, store.id, { kind: 'asesora', chatId: chat.id, title: `${order?.nombre || 'Una clienta'} (pedido #${order?.number || '?'}) necesita respuesta`, body: why });
}

async function mandarAgencias(env, store, chat, order, r) {
  if (r?.kind === 'agencias') {
    const opts = agencyOptions(r.agencias);
    await out(env, store, chat, `Elige la agencia Shalom donde lo recogerás en ${r.lugar} 📍`, {
      list: { button: 'Ver agencias', rows: opts.map((o, i) => ({ id: `shp:ag:${i}`, title: o.title, description: o.desc })) },
    });
    await setPaso(env, chat.id, { o: order.id, paso: 'sede', opts: opts.map((o) => ({ t: o.title, full: o.full })) });
    return true;
  }
  if (r?.kind === 'zonas') {
    await out(env, store, chat, `En ${r.lugar} hay ${r.total} agencias Shalom. ¿En qué ${r.nivel} lo recoges? 📍`, {
      list: { button: 'Elegir', rows: r.zonas.map((z, i) => ({ id: `shp:z:${i}`, title: z.name, description: `${z.count} ${z.count === 1 ? 'agencia' : 'agencias'}` })) },
    });
    await setPaso(env, chat.id, { o: order.id, paso: 'zona', zonas: r.zonas.map((z) => z.name), nivel: r.nivel, dep: r.dep });
    return true;
  }
  return false;
}

// Mensaje del adelanto (también va como texto debajo del video, máx. 1024 letras)
export function textoAdelanto({ first, adelanto, saldo, yape, titular }) {
  return [
    `¡Perfecto${first ? `, ${first}` : ''}! 🙌✨ Ya separamos tu pedido 🛍️`,
    '',
    `Para despacharlo 🚚 solo falta el adelanto de *${money(adelanto)}* 💸`,
    `📲 Yape o Plin: *${yape}*`,
    titular ? `👤 A nombre de: *${titular}*` : null,
    '',
    saldo > 0 ? `El resto (*${money(saldo)}*) lo pagas cuando lo recojas en Shalom 📦` : null,
    'Envíame la captura por aquí y listo 📸💕',
  ].filter((x) => x !== null).join('\n');
}

// Siguiente paso según lo que le falta al pedido
export async function provinciaSiguiente(env, store, chat, order0) {
  const order = shape(await getOrder(env, order0.id));
  const first = String(order.nombre || '').trim().split(/\s+/)[0];
  if (!String(order.dni || '').trim()) {
    await out(env, store, chat, `¡Gracias${first ? `, ${first}` : ''}! 🙌 Para enviarlo por Shalom necesito tu *DNI* (los 8 números) 🪪`);
    return setPaso(env, chat.id, { o: order.id, paso: 'dni' });
  }
  if (!String(order.sede || '').trim()) {
    const r = await agenciesNear(env, [order.distrito, order.ciudad, order.direccion].filter(Boolean).join(' '), '', true).catch(() => null);
    if (await mandarAgencias(env, store, chat, order, r)) return;
    await out(env, store, chat, '¿En qué agencia Shalom de tu ciudad lo recoges? 📍 Escríbeme el distrito o el nombre de la agencia.');
    return setPaso(env, chat.id, { o: order.id, paso: 'sede_txt' });
  }
  // Adelanto
  const s = await loadSettings(env, store.id);
  let adelanto = Number(order.adelanto) || 0;
  if (!adelanto) {
    adelanto = Number(cfgOf(store).adelanto) || 30;
    await env.DB.prepare('UPDATE orders SET adelanto = ?, updated_at = ? WHERE id = ?').bind(adelanto, now(), order.id).run();
  }
  const saldo = Math.max(0, (Number(order.total) || 0) - adelanto);
  await addLabel(env, store.id, chat.id, 'YAPE PENDIENTE');
  if (!s.pay_yape) {
    await out(env, store, chat, '¡Perfecto! ✅ Una asesora te envía los datos para el adelanto en un momento 🙌');
    await aAsesora(env, store, chat, order, 'Falta poner el Yape de la tienda en Bot Suyon AI → IA Suyon (datos de pago).');
  } else {
    const txt = textoAdelanto({ first, adelanto, saldo, yape: s.pay_yape, titular: s.pay_titular });
    // Si la tienda subió el archivo «video-adelanto» (Bot Suyon AI → Archivos), va el video con este texto debajo
    const v = store.status === 'activo' ? await botSend(env, store, chat, { kind: 'file', asset: 'video-adelanto', caption: txt, opcional: true }, { node: 'provincia:adelanto' }).catch(() => null) : null;
    if (!v?.ok) await out(env, store, chat, txt);
  }
  await addEvent(env, order.id, 'mensaje', `Se pidió el adelanto (${money(adelanto)})`);
  return setPaso(env, chat.id, { o: order.id, paso: 'pago' });
}

// Respuesta de la clienta mientras está en estos pasos. true = ya se manejó (no pasa al bot)
export async function handleProvinciaStep(env, store, chat0, msg) {
  const v = await getVars(env, chat0.id);
  const st = v.__shp;
  if (!st) return false;
  const chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chat0.id).first();
  const order = await getOrder(env, st.o);
  if (!order || order.status !== 'por_pagar') {
    await setPaso(env, chat.id, null);
    return false;
  }
  const body = String(msg.body || '').trim();
  const payload = String(msg.payload || '');
  const media = msg.type === 'image' || msg.type === 'document';
  const setOrder = async (campo, valor, txt) => {
    await env.DB.prepare(`UPDATE orders SET ${campo} = ?, updated_at = ? WHERE id = ?`).bind(valor, now(), order.id).run();
    await addEvent(env, order.id, 'edicion', txt);
  };
  if (st.paso === 'pago' || st.paso === 'listo') {
    if (media) {
      // Sin respuesta automática: la captura cae en Pagos y el equipo la confirma
      await setPaso(env, chat.id, { ...st, paso: 'listo' });
      return true;
    }
    await aAsesora(env, store, chat, order, body ? `Escribió: «${clip(body, 120)}»` : 'Mandó un mensaje');
    return true;
  }
  if (st.paso === 'dni') {
    const n = body.replace(/[\s.-]/g, '').match(/(?<!\d)(\d{8}|\d{12})(?!\d)/);
    if (n) {
      await setOrder('dni', n[1], `DNI ${n[1]} (lo mandó por WhatsApp)`);
      await provinciaSiguiente(env, store, chat, order);
    } else await aAsesora(env, store, chat, order, `Esperaba su DNI y escribió: «${clip(body || msg.type, 120)}»`);
    return true;
  }
  if (st.paso === 'zona') {
    const m = /^shp:z:(\d+)$/.exec(payload);
    const zona = m ? st.zonas?.[Number(m[1])] : (st.zonas || []).find((z) => z.toLowerCase() === body.toLowerCase());
    const r = zona ? await agenciesIn(env, st.nivel, zona, st.dep).catch(() => null) : await agenciesNear(env, body, '', true).catch(() => null);
    if (!(await mandarAgencias(env, store, chat, order, r))) {
      if (body && !media) {
        await setOrder('sede', clip(body, 200), `Sede: ${clip(body, 200)}`);
        await provinciaSiguiente(env, store, chat, order);
      } else await aAsesora(env, store, chat, order, 'No pude encontrar su agencia Shalom');
    }
    return true;
  }
  if (st.paso === 'sede' || st.paso === 'sede_txt') {
    const m = /^shp:ag:(\d+)$/.exec(payload);
    let sede = m ? st.opts?.[Number(m[1])]?.full : (st.opts || []).find((o) => o.t.toLowerCase() === body.toLowerCase())?.full;
    if (!sede && st.paso === 'sede_txt' && body) {
      const r = await agenciesNear(env, body, '', true).catch(() => null);
      if (await mandarAgencias(env, store, chat, order, r)) return true;
    }
    if (!sede && body && !media) sede = clip(body, 200);
    if (!sede) {
      await aAsesora(env, store, chat, order, 'Esperaba que elija su agencia Shalom');
      return true;
    }
    await setOrder('sede', sede, `Sede: ${sede}`);
    await provinciaSiguiente(env, store, chat, order);
    return true;
  }
  return false;
}
