// Compra a Meta (Conversions API para mensajes): al crear un pedido de una clienta que llegó por un anuncio
// de clic a WhatsApp, se avisa a Meta con su ctwa_clid para ver el costo real por venta en el Administrador de anuncios.
import { now, clip } from './util.js';
import { graphCall } from './whatsapp.js';
import { addEvent } from './orders.js';
import { notify } from './bot.js';

const lastJson = (ok, msg) => JSON.stringify({ at: now(), ok, msg: clip(msg, 300) });

// Cada cuenta de WhatsApp tiene un solo «conjunto de datos»: si ya existe, Meta devuelve el mismo
export async function ensureDataset(env, store) {
  if (store.capi_dataset) return store.capi_dataset;
  if (!store.waba_id) throw new Error('Primero conecta el número de WhatsApp de esta tienda.');
  const d = await graphCall(env, store, `${store.waba_id}/dataset`, { method: 'POST' });
  const id = String(d?.id || d?.dataset_id || '');
  if (!id) throw new Error('Meta no devolvió el conjunto de datos.');
  await env.DB.prepare('UPDATE stores SET capi_dataset = ? WHERE id = ?').bind(id, store.id).run();
  store.capi_dataset = id;
  return id;
}

export async function sendPurchase(env, storeIn, order) {
  try {
    const store = await env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(storeIn.id).first();
    if (!store?.capi_on || !order || order.capi_at || !order.chat_id || order.status === 'cancelado') return { skipped: true };
    const chat = await env.DB.prepare('SELECT ctwa_clid, sim FROM chats WHERE id = ?').bind(order.chat_id).first();
    if (!chat || chat.sim) return { skipped: true };
    if (!chat.ctwa_clid) {
      await addEvent(env, order.id, 'meta', 'No se avisó la Compra a Meta: la clienta no llegó por un anuncio.');
      return { skipped: true };
    }
    try {
      const dataset = await ensureDataset(env, store);
      await graphCall(env, store, `${dataset}/events`, {
        method: 'POST',
        json: {
          data: [{
            event_name: 'Purchase',
            event_time: Math.floor(now() / 1000),
            action_source: 'business_messaging',
            messaging_channel: 'whatsapp',
            user_data: { whatsapp_business_account_id: String(store.waba_id), ctwa_clid: chat.ctwa_clid },
            custom_data: { currency: store.currency || 'PEN', value: Number(order.total) || 0 },
          }],
        },
      });
      await env.DB.prepare('UPDATE orders SET capi_at = ? WHERE id = ?').bind(now(), order.id).run();
      await env.DB.prepare('UPDATE stores SET capi_last = ? WHERE id = ?').bind(lastJson(true, `Pedido #${order.number}`), store.id).run();
      await addEvent(env, order.id, 'meta', `Compra avisada a Meta (${store.currency || 'PEN'} ${Number(order.total) || 0}) con el anuncio de origen.`);
      return { ok: true };
    } catch (e) {
      await env.DB.prepare('UPDATE stores SET capi_last = ? WHERE id = ?').bind(lastJson(false, e.message), store.id).run();
      await addEvent(env, order.id, 'meta', `No se pudo avisar la Compra a Meta: ${e.message}`);
      await notify(env, store.id, { kind: 'error', title: 'La Compra no llegó a Meta', body: `${e.message} Revisa Configuración → Pedidos → Compra a Meta.`, dedupe: true });
      return { ok: false, error: e.message };
    }
  } catch (e) {
    console.error('capi', e);
    return { ok: false, error: e.message };
  }
}
