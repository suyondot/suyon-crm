// Preguntas del asistente según el producto: si dice «vestido» pregunta el largo, el forro, la ocasión…
// Primero intenta con la IA (Haiku, cuesta menos de un centavo); si no hay clave, saldo o falla,
// usa las preguntas fijas de su tipo de producto. Nunca repite lo que ya se pregunta aparte
// (nombre, precios, envíos, tallas, colores).
import { now, localDay } from './util.js';
import { addSpend } from './saldo.js';
import { iaAllowed } from './billetera.js';

const MODEL = 'claude-haiku-5-5';
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// [palabras que lo identifican, preguntas [pregunta, ejemplo de respuesta]]
const TIPOS = [
  [['vestido', 'enterizo', 'jumpsuit'], [
    ['¿Qué largo tiene?', 'Midi: llega debajo de la rodilla (110 cm desde el hombro)'],
    ['¿Tiene forro o transparenta?', 'Tiene forro completo, no transparenta'],
    ['¿Para qué ocasión es ideal?', 'Para fiestas, matrimonios de día y salidas'],
    ['¿Cómo se pone? (cierre, botones, elástico)', 'Cierre invisible en la espalda'],
    ['¿Cuánto mide y qué talla usa la modelo de las fotos?', 'Mide 1.62 m y usa talla S'],
    ['¿Cómo se lava y se plancha?', 'A mano o en lavadora delicada, plancha tibia'],
  ]],
  [['pantalon', 'jean', 'legging', 'palazzo', 'jogger', 'short', 'falda', 'buzo'], [
    ['¿El tiro es alto, medio o bajo?', 'Tiro alto, estiliza la cintura'],
    ['¿Qué largo tiene? ¿Se puede basta?', 'Largo para tacos (105 cm); se puede bastar'],
    ['¿Estira? ¿Cuánto?', 'Sí, stretch en los dos sentidos'],
    ['¿Tiene bolsillos, pretina o cierre?', 'Bolsillos delanteros y cierre lateral'],
    ['¿Transparenta o se arruga?', 'No transparenta y no se arruga'],
    ['¿Cómo se lava?', 'Lavadora en frío, no usar secadora'],
  ]],
  [['polo', 'blusa', 'camisa', 'top', 'body', 'casaca', 'polera', 'chompa', 'saco', 'blazer', 'pijama', 'conjunto', 'brasier', 'faja'], [
    ['¿Qué tipo de manga y cuello tiene?', 'Manga corta, cuello redondo'],
    ['¿El corte es ajustado, normal u oversize?', 'Oversize: si quieres más ajustado pide una talla menos'],
    ['¿Transparenta? ¿Se arruga?', 'No transparenta, no se arruga'],
    ['¿Qué largo tiene?', 'Llega a la cadera'],
    ['¿Cuánto mide y qué talla usa la modelo de las fotos?', 'Mide 1.60 m y usa talla M'],
    ['¿Cómo se lava?', 'Lavadora en frío, al revés, sin lejía'],
  ]],
  [['zapat', 'sandalia', 'bota', 'botin', 'tacon', 'mocasin', 'sneaker', 'chimpun'], [
    ['¿La horma es normal, grande o pequeña?', 'Horma normal: pide tu talla de siempre'],
    ['¿De qué material es por fuera y por dentro?', 'Cuero sintético, plantilla acolchada'],
    ['¿Qué altura tiene el taco o la plataforma?', 'Plataforma de 4 cm'],
    ['¿Es cómodo para estar todo el día?', 'Sí, suela de goma flexible y antideslizante'],
    ['¿Se puede cambiar si no le queda?', 'Sí, cambio de talla dentro de 7 días sin usar'],
  ]],
  [['cartera', 'bolso', 'mochila', 'billetera', 'morral', 'tote', 'canguro', 'maleta'], [
    ['¿Qué medidas tiene?', '30 × 22 × 12 cm'],
    ['¿De qué material es?', 'Cuero sintético que no se pela'],
    ['¿Cuántos compartimentos tiene? ¿Qué entra?', '3 compartimentos, entra una laptop de 14"'],
    ['¿Cómo cierra y qué correa trae?', 'Cierre metálico y correa larga regulable'],
    ['¿Viene con caja o bolsa de regalo?', 'Sí, con bolsa de tela'],
  ]],
  [['collar', 'arete', 'anillo', 'pulsera', 'reloj', 'joya', 'cadena', 'dije', 'tobillera', 'lente'], [
    ['¿De qué material es?', 'Acero quirúrgico con baño de oro de 18k'],
    ['¿Se oscurece o se despinta?', 'No se oscurece, resiste el agua'],
    ['¿Es hipoalergénico?', 'Sí, no da alergia'],
    ['¿Qué medidas tiene?', 'Cadena de 45 cm regulable'],
    ['¿Viene en caja de regalo?', 'Sí, en cajita con tarjeta'],
  ]],
  [['crema', 'serum', 'colageno', 'capsula', 'vitamina', 'suplemento', 'perfume', 'shampoo', 'gel', 'aceite', 'maquillaje', 'labial', 'proteina', 'infusion', 'jabon', 'mascarilla', 'locion'], [
    ['¿Qué contenido trae? (ml, gramos, cápsulas)', '60 cápsulas: alcanza para 1 mes'],
    ['¿Cómo se usa?', '2 cápsulas al día con el desayuno'],
    ['¿En cuánto tiempo se ven resultados?', 'Desde las 3 semanas'],
    ['¿Tiene registro sanitario?', 'Sí, registro DIGESA N° …'],
    ['¿Quién NO debe usarlo?', 'Embarazadas y menores de 12 años'],
    ['¿Cuánto dura una vez abierto? ¿Fecha de vencimiento?', 'Vence en 2027; abierto dura 6 meses'],
  ]],
  [['audifono', 'parlante', 'cargador', 'smartwatch', 'celular', 'cable', 'camara', 'lampara', 'luz led', 'proyector', 'mouse', 'teclado', 'tablet', 'power bank', 'freidora', 'licuadora', 'aspiradora', 'plancha', 'secadora'], [
    ['¿Cuánto dura la batería o cuánta potencia tiene?', '8 horas de música, carga en 1 hora'],
    ['¿Con qué es compatible?', 'iPhone y Android, por Bluetooth 5.3'],
    ['¿Qué incluye la caja?', 'Equipo, cable USB-C y manual en español'],
    ['¿Tiene garantía? ¿De cuánto tiempo?', '3 meses por fallas de fábrica'],
    ['¿Cómo se usa o se instala?', 'Se enciende y se conecta solo al celular'],
  ]],
  [['cuadro', 'personalizad', 'taza', 'polo estampado', 'regalo', 'peluche', 'llavero', 'agenda', 'arreglo'], [
    ['¿Qué datos necesitas de la clienta para personalizarlo?', 'Foto, nombre y frase'],
    ['¿Cuánto demora en estar listo?', '2 días hábiles desde que manda la foto'],
    ['¿Qué medidas o tamaños hay?', '30 × 40 cm'],
    ['¿Le muestras un diseño antes de hacerlo?', 'Sí, le mando la prueba por WhatsApp'],
    ['¿Viene listo para regalar?', 'Sí, en caja con lazo'],
  ]],
  [['mueble', 'organizador', 'olla', 'sarten', 'cocina', 'repisa', 'cortina', 'sabana', 'edredon', 'almohada', 'alfombra', 'maceta', 'tomatodo', 'termo', 'tupper'], [
    ['¿Qué medidas o capacidad tiene?', '1.5 litros / 40 × 30 cm'],
    ['¿De qué material es?', 'Acero inoxidable, libre de BPA'],
    ['¿Cómo se limpia?', 'Se puede lavar en lavavajillas'],
    ['¿Viene armado? ¿Qué incluye?', 'Viene armado, con tapa y repuesto'],
    ['¿Tiene garantía?', '6 meses por fallas de fábrica'],
  ]],
];

const GENERAL = [
  ['¿Qué incluye la compra?', 'El producto en su caja y un regalo sorpresa'],
  ['¿Qué medidas o tamaño tiene?', '20 × 15 cm, entra en la cartera'],
  ['¿De qué material está hecho?', 'Material resistente que no se raya'],
  ['¿Cómo se usa?', 'Se usa directo, no necesita instalación'],
  ['¿Cuánto dura o rinde?', 'Dura años con el cuidado normal'],
  ['¿Por qué es mejor que otros parecidos?', 'Es original, con garantía y envío rápido'],
];

export function preguntasBase(rubro, producto, descripcion = '') {
  // Palabras que EMPIEZAN igual («zapat» → zapatilla); se compara solo el nombre primero y luego la descripción
  const norm = (s) => ` ${sinTildes(s).replace(/[^a-z0-9]+/g, ' ')} `;
  const hit = (t) => TIPOS.find(([ws]) => ws.some((w) => t.includes(' ' + w.trim())));
  const tipo = hit(norm(producto)) || hit(norm(descripcion));
  let qs = tipo ? tipo[1] : GENERAL;
  if (!tipo && rubro === 'ropa') qs = TIPOS[2][1]; // ropa sin tipo claro: las de polo/blusa
  return qs.map(([q, ej]) => ({ q, ej }));
}

function clean(list) {
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const q = String(x?.q || x?.pregunta || '').trim().slice(0, 150);
    const ej = String(x?.ej || x?.ejemplo || '').trim().slice(0, 150);
    if (q.length < 8 || out.some((o) => o.q === q)) continue;
    // Lo que ya se pregunta en otros pasos no se repite
    if (/precio|cuesta|env[ií]o|delivery|talla|color|nombre de (tu|la) marca/i.test(q)) continue;
    out.push({ q: /[?]$/.test(q) ? q : q + '?', ej });
    if (out.length >= 7) break;
  }
  return out;
}

// { preguntas: [{q, ej}], fuente: 'ia' | 'base' }
export async function preguntasProducto(env, store, { rubro, producto, descripcion, tela, ya = [] }) {
  const base = preguntasBase(rubro, producto, descripcion);
  const key = env.ANTHROPIC_API_KEY;
  if (!key || !producto) return { preguntas: base, fuente: 'base' };
  if (!(await iaAllowed(env, store.id)).ok) return { preguntas: base, fuente: 'base' };
  const system = `Ayudas a un emprendedor peruano a preparar a su vendedora de WhatsApp. Te dice qué producto vende.
Escribe de 5 a 7 preguntas MUY específicas de ESE producto: lo que las clientas suelen preguntar antes de comprarlo y que la vendedora debe saber responder (medidas, material, uso, cuidados, resultados, qué incluye, para quién es, etc.).
NO preguntes por: precio, promociones, envío, delivery, formas de pago, nombre de la marca${rubro === 'ropa' ? ', tallas ni colores (se preguntan aparte)' : ''}.
Cada pregunta va dirigida al dueño (tú le preguntas a él), corta y clara, en español peruano sencillo. Para cada una da un ejemplo corto de respuesta («ej»).
Responde SOLO con JSON: {"preguntas":[{"q":"…","ej":"…"}]}`;
  const user = `Producto: ${producto}${descripcion ? `\nDescripción: ${descripcion}` : ''}${tela ? `\nTela/material: ${tela}` : ''}\nTipo: ${rubro === 'ropa' ? 'ropa con tallas y colores' : 'producto sin variantes'}${ya.length ? `\nYa le preguntaste esto; ahora haz preguntas DISTINTAS:\n${ya.map((q) => `- ${q}`).join('\n')}` : ''}`;
  try {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 9000);
    const res = await fetch((env.ANTHROPIC_API || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages: [{ role: 'user', content: user }] }),
    });
    clearTimeout(tm);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { preguntas: base, fuente: 'base' };
    const inTok = data.usage?.input_tokens || 0;
    const outTok = data.usage?.output_tokens || 0;
    const cost = (inTok * 0.1 + outTok * 0.5) / 1e6;
    await env.DB.prepare(
      `INSERT INTO ia_usage (store_id, day, calls, in_tokens, out_tokens, cost) VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT (store_id, day) DO UPDATE SET calls = calls + 1, in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens, cost = cost + excluded.cost`
    ).bind(store.id, localDay(now(), store.timezone || 'America/Lima'), inTok, outTok, cost).run().catch(() => {});
    await addSpend(env, 'anthropic', cost, store.timezone, store.id);
    const txt = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const m = txt.match(/\{[\s\S]*\}/);
    const qs = clean(m ? JSON.parse(m[0]).preguntas : []).filter((x) => !ya.includes(x.q));
    if (qs.length >= 3) return { preguntas: qs, fuente: 'ia' };
  } catch {}
  return { preguntas: base, fuente: 'base' };
}
