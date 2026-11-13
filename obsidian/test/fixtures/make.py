# Makes the color, depth and WebP fixtures: python3 test/fixtures/make.py test/fixtures/photo.png test/fixtures/display-p3.icc test/fixtures
import sys, zlib, struct, io
import numpy as np
from PIL import Image
seed, icc_path, out = sys.argv[1:4]
icc = open(icc_path, 'rb').read()
im = Image.open(seed).convert('RGB')
w, h = im.size
im = im.crop((80, 60, 208, 156))
a = np.asarray(im).astype(np.uint16)
rng = np.random.default_rng(7)
# True 16-bit: each 8-bit level spread with low-byte detail, so an 8-bit file cannot hold it.
a16 = (a * 257 + rng.integers(0, 256, a.shape)).clip(0, 65535).astype('>u2')
def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
def png16(arr, icc=None, interlace=0):
    H, W, _ = arr.shape
    raw = b''.join(b'\0' + arr[y].tobytes() for y in range(H))
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 16, 2, 0, 0, interlace))
    if icc: out += chunk(b'iCCP', b'Display P3\0\0' + zlib.compress(icc))
    return out + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
open(f'{out}/p3-16bit.png', 'wb').write(png16(a16, icc))
open(f'{out}/srgb-16bit.png', 'wb').write(png16(a16))
buf = io.BytesIO(); im.save(buf, 'WEBP', lossless=True, icc_profile=icc); open(f'{out}/p3-lossless.webp', 'wb').write(buf.getvalue())
buf = io.BytesIO(); im.save(buf, 'WEBP', lossless=True, exif=b'Exif\0\0MM\0*\0\0\0\x08\0\0'); open(f'{out}/exif-lossless.webp', 'wb').write(buf.getvalue())
buf = io.BytesIO(); im.save(buf, 'WEBP', quality=80, icc_profile=icc); open(f'{out}/p3-lossy.webp', 'wb').write(buf.getvalue())
# Low bit depths, written by hand (Pillow writes 8 bits), each with its 8-bit twin.
def pack(vals, depth):
    out = bytearray(); per = 8 // depth
    for i in range(0, len(vals), per):
        byte = 0
        for j in range(per):
            v = int(vals[i + j]) if i + j < len(vals) else 0
            byte |= v << (8 - depth * (j + 1))
        out.append(byte)
    return bytes(out)
def png(w, h, depth, ctype, rows, extra=b''):
    raw = b''.join(b'\0' + r for r in rows)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, depth, ctype, 0, 0, 0)) + extra + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
small = Image.open(seed).convert('RGB').crop((0, 0, 61, 47))  # odd sizes: rows end inside a byte
q = small.quantize(16); pal = bytes(q.getpalette()[:48]); idx = np.asarray(q)
plte = chunk(b'PLTE', pal) + chunk(b'tRNS', bytes([255, 128, 0] + [255] * 13))
w, h = small.size
open(f'{out}/pal4.png', 'wb').write(png(w, h, 4, 3, [pack(r, 4) for r in idx], plte))
open(f'{out}/pal8.png', 'wb').write(png(w, h, 8, 3, [bytes(r.astype(np.uint8)) for r in idx], plte))
g = np.asarray(small.convert('L')) >> 6
open(f'{out}/gray2.png', 'wb').write(png(w, h, 2, 0, [pack(r, 2) for r in g]))
open(f'{out}/gray8.png', 'wb').write(png(w, h, 8, 0, [bytes((r * 85).astype(np.uint8)) for r in g]))
rgba = Image.open(seed).convert('RGBA').crop((0, 0, 64, 48)); rgba.putalpha(Image.linear_gradient('L').resize((64, 48)))
rgba.save(f'{out}/alpha.png'); rgba.save(f'{out}/alpha.webp', lossless=True, exact=True)
# Animated: two frames, each lossless (a WebP of two ANMF frames, and an APNG).
flip = Image.open(seed).convert('RGB').crop((0, 0, 64, 48))
flip.save(f'{out}/anim-lossless.webp', save_all=True, append_images=[flip.transpose(Image.FLIP_LEFT_RIGHT)], lossless=True, duration=200, loop=0)
flip.save(f'{out}/anim.png', save_all=True, append_images=[flip.transpose(Image.FLIP_LEFT_RIGHT)], duration=200, loop=0)
