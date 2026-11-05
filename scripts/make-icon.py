# Draws the Hangar icon: a deep indigo rounded square holding three tiles,
# one tall, one quiet and one amber ("needs you"). Kept to three shapes so it
# stays crisp down to 16 px.
#   python3 scripts/make-icon.py build
import os, subprocess, sys
from PIL import Image, ImageDraw

S = 1024


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def icon(size=S, pad=56):
    k = 4  # draw large, then scale down for smooth edges
    W = size * k
    sc = W / S
    p = pad * sc
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    grad = Image.new('RGBA', (W, W))
    gd = ImageDraw.Draw(grad)
    for y in range(W):
        gd.line([(0, y), (W, y)], fill=lerp((46, 50, 82, 255), (14, 15, 22, 255), y / W))
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle([p, p, W - p, W - p], radius=int(228 * sc), fill=255)
    img.paste(grad, (0, 0), mask)
    edge = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle([p, p, W - p, W - p], radius=int(228 * sc), outline=(255, 255, 255, 34), width=max(1, int(5 * sc)))
    img = Image.alpha_composite(img, edge)
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 240 * sc, 240 * sc, 784 * sc, 784 * sc
    g = 42 * sc
    mid = x0 + (x1 - x0) * 0.56
    ym = (y0 + y1) / 2
    r = int(54 * sc)
    d.rounded_rectangle([x0, y0, mid - g / 2, y1], radius=r, fill=(242, 244, 250, 255))
    d.rounded_rectangle([mid + g / 2, y0, x1, ym - g / 2], radius=r, fill=(118, 124, 152, 255))
    d.rounded_rectangle([mid + g / 2, ym + g / 2, x1, y1], radius=r, fill=(245, 181, 69, 255))
    return img.resize((size, size), Image.LANCZOS)


out = sys.argv[1]
base = icon()
base.save(os.path.join(out, 'icon.png'))
iconset = os.path.join(out, 'icon.iconset')
os.makedirs(iconset, exist_ok=True)
for s in [16, 32, 64, 128, 256, 512]:
    icon(s).save(os.path.join(iconset, f'icon_{s}x{s}.png'))
    icon(s * 2).save(os.path.join(iconset, f'icon_{s}x{s}@2x.png'))
subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', os.path.join(out, 'icon.icns')], check=True)
base.save(os.path.join(out, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
