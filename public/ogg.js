// Convierte una nota de voz grabada en el navegador (WebM con Opus, lo que graba Chrome)
// a OGG con Opus, que es lo que WhatsApp acepta y muestra como nota de voz.
// No recodifica el audio: solo cambia el "envase", así que es instantáneo.

const ID = {
  EBML: 0x1a45dfa3, Segment: 0x18538067, Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7,
  CodecID: 0x86, CodecPrivate: 0x63a2, Audio: 0xe1, Channels: 0x9f, Cluster: 0x1f43b675,
  SimpleBlock: 0xa3, BlockGroup: 0xa0, Block: 0xa1,
};
const MASTER = new Set([ID.Segment, ID.Tracks, ID.TrackEntry, ID.Audio, ID.Cluster, ID.BlockGroup]);

function readVint(buf, pos, keepMarker) {
  const first = buf[pos];
  if (first === undefined) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    len++;
    mask >>= 1;
  }
  if (len > 8 || pos + len > buf.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: !keepMarker && allOnes };
}

export function webmOpusToOgg(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  let pos = 0;
  let track = null; // { number, codec, priv, channels }
  const tracks = [];
  let cur = null;
  const packets = [];

  while (pos < buf.length) {
    const id = readVint(buf, pos, true);
    if (!id) break;
    const size = readVint(buf, pos + id.len, false);
    if (!size) break;
    const start = pos + id.len + size.len;
    const end = size.unknown ? buf.length : Math.min(start + size.value, buf.length);
    if (MASTER.has(id.value)) {
      if (id.value === ID.TrackEntry) {
        cur = { number: 0, codec: '', priv: null, channels: 1 };
        tracks.push(cur);
      }
      pos = start; // entrar al elemento (sirve también con tamaño desconocido)
      continue;
    }
    const data = buf.subarray(start, end);
    switch (id.value) {
      case ID.TrackNumber:
        if (cur) cur.number = data.reduce((a, b) => a * 256 + b, 0);
        break;
      case ID.CodecID:
        if (cur) cur.codec = new TextDecoder().decode(data);
        break;
      case ID.CodecPrivate:
        if (cur) cur.priv = data.slice();
        break;
      case ID.Channels:
        if (cur) cur.channels = data.reduce((a, b) => a * 256 + b, 0) || 1;
        break;
      case ID.SimpleBlock:
      case ID.Block: {
        if (!track) track = tracks.find((t) => t.codec === 'A_OPUS');
        if (!track) throw new Error('El audio no es Opus');
        const tn = readVint(data, 0, false);
        if (tn.value !== track.number) break;
        const flags = data[tn.len + 2];
        if (flags & 0x06) throw new Error('Audio con "lacing" no soportado');
        packets.push(data.slice(tn.len + 3));
        break;
      }
    }
    pos = end;
  }
  if (!track) track = tracks.find((t) => t.codec === 'A_OPUS');
  if (!track || !packets.length) throw new Error('No se encontró audio en la grabación');
  const head = track.priv && track.priv.length >= 19 ? track.priv : opusHead(track.channels);
  return buildOgg(head, packets);
}

function opusHead(channels) {
  const h = new Uint8Array(19);
  h.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]); // "OpusHead"
  const v = new DataView(h.buffer);
  h[8] = 1;
  h[9] = channels;
  v.setUint16(10, 312, true);
  v.setUint32(12, 48000, true);
  return h;
}

function opusTags() {
  const vendor = new TextEncoder().encode('Control Total');
  const t = new Uint8Array(8 + 4 + vendor.length + 4);
  t.set(new TextEncoder().encode('OpusTags'));
  new DataView(t.buffer).setUint32(8, vendor.length, true);
  t.set(vendor, 12);
  return t;
}

// Cantidad de muestras (a 48 kHz) que dura un paquete Opus, según su primer byte (TOC)
export function opusSamples(pkt) {
  if (!pkt.length) return 0;
  const toc = pkt[0];
  const config = toc >> 3;
  let ms;
  if (config < 12) ms = [10, 20, 40, 60][config % 4];
  else if (config < 16) ms = [10, 20][config % 2];
  else ms = [2.5, 5, 10, 20][config % 4];
  const c = toc & 3;
  const frames = c === 0 ? 1 : c === 3 ? (pkt[1] || 0) & 0x3f : 2;
  return Math.round(ms * 48) * frames;
}

let CRC;
function crc32(bytes) {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i << 24;
      for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
      CRC[i] = r >>> 0;
    }
  }
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ CRC[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  return crc;
}

function page(packetsOnPage, granule, serial, seq, flags) {
  const lacing = [];
  for (const p of packetsOnPage) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const dataLen = packetsOnPage.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + dataLen);
  const v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53]); // "OggS"
  out[5] = flags;
  v.setUint32(6, granule % 0x100000000, true);
  v.setUint32(10, Math.floor(granule / 0x100000000), true);
  v.setUint32(14, serial, true);
  v.setUint32(18, seq, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const p of packetsOnPage) {
    out.set(p, o);
    o += p.length;
  }
  v.setUint32(22, crc32(out), true);
  return out;
}

function buildOgg(head, packets) {
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const pages = [page([head], 0, serial, 0, 0x02), page([opusTags()], 0, serial, 1, 0)];
  let seq = 2;
  let granule = 0;
  let group = [];
  let segs = 0;
  for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    const need = Math.floor(p.length / 255) + 1;
    if (group.length && segs + need > 255) {
      pages.push(page(group, granule, serial, seq++, 0));
      group = [];
      segs = 0;
    }
    group.push(p);
    segs += need;
    granule += opusSamples(p);
  }
  pages.push(page(group, granule, serial, seq++, 0x04));
  const total = pages.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of pages) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
