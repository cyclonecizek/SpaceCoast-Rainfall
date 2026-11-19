/* MRMS GRIB2 (PNG-packed, template 5.41) decoder that crops to a lat/lon box while streaming.
   Works in browsers and Node 18+. Returns values in the file's own units (MRMS QPE: mm). */
const MRMS = (() => {
  const u16 = (b, o) => (b[o] << 8) | b[o + 1];
  const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const s16 = (b, o) => { const v = u16(b, o); return v & 0x8000 ? -(v & 0x7fff) : v; };   // GRIB sign-magnitude
  const s32 = (b, o) => { const v = u32(b, o); return v & 0x80000000 ? -(v & 0x7fffffff) : v; };

  async function gunzip(buf) {
    const b = new Uint8Array(buf);
    if (!(b[0] === 0x1f && b[1] === 0x8b)) return b;
    const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }

  function parseGrib(b) {
    let p = 0;
    while (p < b.length - 4 && !(b[p] === 71 && b[p + 1] === 82 && b[p + 2] === 73 && b[p + 3] === 66)) p++;
    if (p >= b.length - 16) throw Error('Not a GRIB file.');
    if (b[p + 7] !== 2) throw Error('Not GRIB edition 2.');
    const end = p + u32(b, p + 12); // low 32 bits of the 8-byte total length
    p += 16;
    const g = {};
    while (p < end - 4) {
      const len = u32(b, p), num = b[p + 4];
      if (len < 5) break;
      if (num === 1) g.ref = Date.UTC(u16(b, p + 12), b[p + 14] - 1, b[p + 15], b[p + 16], b[p + 17], b[p + 18]);
      else if (num === 3) {
        if (u16(b, p + 12) !== 0) throw Error('Unsupported grid template ' + u16(b, p + 12) + ' (expected lat/lon).');
        g.ni = u32(b, p + 30); g.nj = u32(b, p + 34);
        g.la1 = s32(b, p + 46) / 1e6; g.lo1 = s32(b, p + 50) / 1e6;
        g.la2 = s32(b, p + 55) / 1e6; g.lo2 = s32(b, p + 59) / 1e6;
        g.di = u32(b, p + 63) / 1e6; g.dj = u32(b, p + 67) / 1e6; g.scan = b[p + 71];
      } else if (num === 5) {
        g.tmpl = u16(b, p + 9);
        const dv = new DataView(b.buffer, b.byteOffset + p + 11, 4);
        g.R = dv.getFloat32(0, false); g.E = s16(b, p + 15); g.D = s16(b, p + 17); g.bits = b[p + 19];
      } else if (num === 6) g.bitmap = b[p + 5];
      else if (num === 7) g.data = b.subarray(p + 5, p + len);
      p += len;
    }
    if (!g.data || g.ni === undefined) throw Error('Incomplete GRIB message.');
    return g;
  }

  /* Decode gzip'd or plain GRIB2 bytes, keeping only cells inside box {s,n,w,e} (degrees, lon -180..180). */
  async function decode(buf, box) {
    const b = await gunzip(buf), g = parseGrib(b);
    if (g.tmpl !== 41 && g.tmpl !== 40010) throw Error('Unsupported GRIB packing template 5.' + g.tmpl + ' (expected PNG 5.41).');
    if (g.bitmap !== undefined && g.bitmap !== 255) throw Error('GRIB bitmap section not supported.');
    if (g.scan & 0x80 || g.scan & 0x20) throw Error('Unsupported GRIB scanning mode.');
    const northFirst = !(g.scan & 0x40);
    const lo1 = g.lo1 > 180 ? g.lo1 - 360 : g.lo1;
    const latN = northFirst ? g.la1 : g.la1 + g.dj * (g.nj - 1);
    // crop indices in a north-first frame
    const i0 = Math.max(0, Math.ceil((box.w - lo1) / g.di - 1e-6)), i1 = Math.min(g.ni - 1, Math.floor((box.e - lo1) / g.di + 1e-6));
    const j0 = Math.max(0, Math.ceil((latN - box.n) / g.dj - 1e-6)), j1 = Math.min(g.nj - 1, Math.floor((latN - box.s) / g.dj + 1e-6));
    if (i1 < i0 || j1 < j0) throw Error('Requested box is outside the MRMS grid.');
    const nx = i1 - i0 + 1, ny = j1 - j0 + 1, out = new Float32Array(nx * ny).fill(NaN);
    // file rows that we need (file order)
    const fr0 = northFirst ? j0 : g.nj - 1 - j1, fr1 = northFirst ? j1 : g.nj - 1 - j0;

    // --- PNG container ---
    const d = g.data;
    if (!(d[0] === 0x89 && d[1] === 0x50)) throw Error('GRIB data section is not a PNG stream.');
    let q = 8, W = 0, H = 0, depth = 0, ctype = 0; const idat = [];
    while (q < d.length - 8) {
      const len = u32(d, q), type = String.fromCharCode(d[q + 4], d[q + 5], d[q + 6], d[q + 7]);
      if (type === 'IHDR') { W = u32(d, q + 8); H = u32(d, q + 12); depth = d[q + 16]; ctype = d[q + 17]; if (d[q + 20]) throw Error('Interlaced PNG not supported.'); }
      else if (type === 'IDAT') idat.push(d.subarray(q + 8, q + 8 + len));
      else if (type === 'IEND') break;
      q += 12 + len;
    }
    if (W !== g.ni || H !== g.nj) throw Error('PNG size does not match the GRIB grid.');
    const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
    if (!ch || depth < 8) throw Error('Unsupported PNG pixel format.');
    const bpp = ch * depth / 8, rowLen = W * bpp, scale = Math.pow(2, g.E), dec = Math.pow(10, -g.D);

    const stream = new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'));
    const reader = stream.getReader();
    let cur = new Uint8Array(rowLen), prev = new Uint8Array(rowLen), filter = -1, col = 0, row = 0, done = false;
    const finishRow = () => {
      // unfilter cur in place
      const a = cur, pr = prev;
      if (filter === 1) { for (let x = bpp; x < rowLen; x++) a[x] = (a[x] + a[x - bpp]) & 255; }
      else if (filter === 2) { for (let x = 0; x < rowLen; x++) a[x] = (a[x] + pr[x]) & 255; }
      else if (filter === 3) { for (let x = 0; x < rowLen; x++) a[x] = (a[x] + (((x >= bpp ? a[x - bpp] : 0) + pr[x]) >> 1)) & 255; }
      else if (filter === 4) {
        for (let x = 0; x < rowLen; x++) {
          const A = x >= bpp ? a[x - bpp] : 0, B = pr[x], C = x >= bpp ? pr[x - bpp] : 0;
          const pp = A + B - C, pa = Math.abs(pp - A), pb = Math.abs(pp - B), pc = Math.abs(pp - C);
          a[x] = (a[x] + (pa <= pb && pa <= pc ? A : pb <= pc ? B : C)) & 255;
        }
      } else if (filter !== 0) throw Error('Corrupt PNG filter byte.');
      if (row >= fr0 && row <= fr1) {
        const oj = northFirst ? row - j0 : (g.nj - 1 - row) - j0;
        for (let i = 0; i < nx; i++) {
          let o = (i0 + i) * bpp, v = 0;
          for (let k = 0; k < bpp; k++) v = v * 256 + a[o + k];
          out[oj * nx + i] = (g.R + v * scale) * dec;
        }
      }
      const t = prev; prev = cur; cur = t; row++; filter = -1; col = 0;
      if (row > fr1) done = true;
    };
    while (!done) {
      const { value, done: eof } = await reader.read();
      if (eof) break;
      let o = 0;
      while (o < value.length && !done) {
        if (filter < 0) { filter = value[o++]; continue; }
        const n = Math.min(rowLen - col, value.length - o);
        cur.set(value.subarray(o, o + n), col); col += n; o += n;
        if (col === rowLen) finishRow();
      }
    }
    try { await reader.cancel(); } catch (e) { /* stream already closed */ }
    if (row <= fr1) throw Error('MRMS file ended early (truncated download).');
    return { nx, ny, dx: g.di, dy: g.dj, west: lo1 + i0 * g.di, north: latN - j0 * g.dj, ref: g.ref, data: out };
  }

  /* Break the half-open hour window (a, b] into the fewest MRMS accumulation files.
     Returns [{end: msUTC, hours}] newest first. */
  function decompose(aMs, bMs, durations = [72, 48, 24, 12, 6, 3, 1]) {
    const H = 3600000; let t = bMs, left = Math.round((bMs - aMs) / H); const out = [];
    while (left > 0) { const d = durations.find(x => x <= left); out.push({ end: t, hours: d }); t -= d * H; left -= d; }
    return out;
  }
  return { decode, decompose, parseGrib };
})();
if (typeof module !== 'undefined') module.exports = MRMS;
