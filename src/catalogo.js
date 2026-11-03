// Colores, tallas y nombres: mismas reglas para reportes, pedidos y Shopify
import { recognize } from './bot.js';
import { TALLAS } from './bot-template.js';

export const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const title = (s) => String(s || '').trim().toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

// Colores oficiales y sinónimos (los mismos que usa la IA)
const COLOR_RULES = [
  [/gris\s*claro|plomo\s*claro/, 'Gris claro'],
  [/gris\s*oscuro|plomo\s*oscuro|plomo/, 'Gris oscuro'],
  [/azul|marino/, 'Azul noche'],
  [/vino|guinda|rojo|granate/, 'Vino'],
  [/perla|blanco|hueso|crema/, 'Perla'],
  [/beige|nude|camel/, 'Beige'],
  [/negro/, 'Negro'],
  [/gris/, 'Gris claro'],
];
export function colorsOf(text) {
  const out = [];
  for (const part of String(text || '').split(/,|\sy\s|\+|\/|;|\n/)) {
    const p = strip(part).replace(/^\d+\s*(x\s*)?/, '');
    if (!p) continue;
    const hit = COLOR_RULES.find(([re]) => re.test(p));
    out.push(hit ? hit[1] : title(p).slice(0, 24));
  }
  return out;
}

export function tallaOf(text) {
  if (!text) return null;
  const t = String(text).trim();
  const up = t.toUpperCase();
  if (/^(XXL|XL|L|M|S|XS)$/.test(up)) return up === 'XXL' ? 'XL' : up;
  return recognize(t, TALLAS) || null;
}

