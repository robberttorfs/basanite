# Draws the Basanite icon: a slab of black stone with one wedge of gold, the streak
# gold leaves on a touchstone. Two shapes, so it stays crisp down to 16 px.
#   python scripts/make-icon.py build
import os, sys
from PIL import Image, ImageDraw

SLAB = [(17, 3), (54, 7), (61, 40), (41, 61), (8, 55), (3, 20)]
STREAK = [(9, 45), (56, 10), (45, 37)]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def gradient(W, c0, c1, flip=False):
    img = Image.new('RGBA', (W, W))
    px = img.load()
    for y in range(W):
        for x in range(W):
            t = (x + y) / (2 * W) if not flip else (x + W - y) / (2 * W)
            px[x, y] = lerp(c0, c1, t)
    return img


def icon(size=1024):
    W = min(size * 4, 2048)
    sc = W / 64
    # a little inside the frame, so it sits like other app icons
    P = lambda pts: [(W * 0.06 + x * sc * 0.88, W * 0.06 + y * sc * 0.88) for x, y in pts]
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).polygon(P(SLAB), fill=255)
    img.paste(gradient(W, (66, 69, 76, 255), (17, 18, 21, 255)), (0, 0), mask)
    ImageDraw.Draw(img).line(P(SLAB) + P(SLAB)[:1], fill=(104, 107, 114, 255), width=max(1, int(1.3 * sc)), joint='curve')
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).polygon(P(STREAK), fill=255)
    img.paste(gradient(W, (233, 160, 44, 255), (255, 219, 142, 255), flip=True), (0, 0), mask)
    return img.resize((size, size), Image.LANCZOS)


out = sys.argv[1] if len(sys.argv) > 1 else 'build'
os.makedirs(out, exist_ok=True)
base = icon(1024)
base.save(os.path.join(out, 'icon.png'))
base.save(os.path.join(out, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
base.save(os.path.join(out, 'icon.icns'))
