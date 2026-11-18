// Seeded Mersenne Twister (MT19937) random generator used by the Time Machine, so a seed always reproduces the same run.
// Provides seed(int), random(), choice(seq), randint(a,b).
export class PyRandom {
  constructor(seed) { this.mt = new Uint32Array(624); this.idx = 624; this._seed(Math.abs(seed)); }
  _initGenrand(s) { const mt = this.mt; mt[0] = s >>> 0; for (let i = 1; i < 624; i++) { const p = mt[i - 1] ^ (mt[i - 1] >>> 30); mt[i] = (Math.imul(1812433253, p) + i) >>> 0; } }
  _seed(n) {
    const key = []; let x = BigInt(n); if (x === 0n) key.push(0); while (x > 0n) { key.push(Number(x & 0xffffffffn)); x >>= 32n; }
    const mt = this.mt; this._initGenrand(19650218);
    let i = 1, j = 0; const kl = key.length;
    for (let k = Math.max(624, kl); k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0; i++; j++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; } if (j >= kl) j = 0;
    }
    for (let k = 623; k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0; i++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000; this.idx = 624;
  }
  _u32() {
    const mt = this.mt;
    if (this.idx >= 624) {
      for (let k = 0; k < 624; k++) { const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff); let v = mt[(k + 397) % 624] ^ (y >>> 1); if (y & 1) v ^= 0x9908b0df; mt[k] = v >>> 0; }
      this.idx = 0;
    }
    let y = mt[this.idx++]; y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18; return y >>> 0;
  }
  random() { const a = this._u32() >>> 5, b = this._u32() >>> 6; return (a * 67108864 + b) / 9007199254740992; }
  _below(n) { if (n <= 0) throw new Error('empty'); const k = 32 - Math.clz32(n); let r = this._u32() >>> (32 - k); while (r >= n) r = this._u32() >>> (32 - k); return r; }
  randint(a, b) { return a + this._below(b - a + 1); }
  choice(arr) { return arr[this._below(arr.length)]; }
}
