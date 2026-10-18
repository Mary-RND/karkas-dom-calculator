# -*- coding: utf-8 -*-
"""Рисует иконку приложения (монограмма «КД» на градиенте) -> app.ico."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.ico")
SIZE = 256

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# скруглённый квадрат с градиентом
grad = Image.new("RGB", (SIZE, SIZE))
gd = ImageDraw.Draw(grad)
c1, c2 = (108, 140, 255), (155, 108, 255)
for y in range(SIZE):
    t = y / (SIZE - 1)
    gd.line([(0, y), (SIZE, y)], fill=(
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t)))

mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=56, fill=255)
img.paste(grad, (0, 0), mask)

# монограмма
try:
    font = ImageFont.truetype("arialbd.ttf", 120)
except OSError:
    font = ImageFont.load_default()

text = "КД"
bbox = d.textbbox((0, 0), text, font=font)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
d.text(((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1] - 6), text, font=font, fill=(255, 255, 255, 255))

img.save(OUT, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("Иконка:", OUT)
