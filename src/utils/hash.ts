export async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const digest = await subtle.digest("SHA-1", buffer);
      return bytesToHex(new Uint8Array(digest));
    } catch {
      // Some embedded browser contexts expose crypto without SHA-1 support.
    }
  }

  return bytesToHex(sha1Digest(bytes));
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sha1Digest(message: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((message.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.byteLength] = 0x80;

  const bitLength = message.byteLength * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, h0);
  digestView.setUint32(4, h1);
  digestView.setUint32(8, h2);
  digestView.setUint32(12, h3);
  digestView.setUint32(16, h4);
  return digest;
}

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}
