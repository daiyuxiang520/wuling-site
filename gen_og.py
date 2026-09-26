#!/usr/bin/env python3
# 生成官网分享预览图 1200x630
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import math

W, H = 1200, 630
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

def font(sz, idx=0):
    return ImageFont.truetype(FONT, sz, index=idx)

# ---- 渐变背景（青绿对角线）----
top = np.array([11, 114, 133])     # #0b7285
bot = np.array([18, 184, 134])     # #12b886
gx = np.linspace(0, 1, W)[None, :, None]
gy = np.linspace(0, 1, H)[:, None, None]
blend = np.clip(gx * 0.45 + gy * 0.55, 0, 1)
grad = (top * (1 - blend) + bot * blend).astype(np.uint8)
img = Image.fromarray(grad, "RGB").convert("RGBA")
draw = ImageDraw.Draw(img)

# ---- 柔光装饰圆 ----
def glow(cx, cy, r, color, alpha):
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (alpha,))
    g = g.filter(ImageFilter.GaussianBlur(60))
    img.alpha_composite(g)

glow(120, 90, 180, (255, 255, 255), 40)
glow(1080, 560, 220, (124, 58, 237), 35)

# ---- App 图标（圆角 + 白边 + 阴影）----
icon = Image.open("/workspace/wuling-site/icon.png").convert("RGBA")
S = 220
icon = icon.resize((S, S), Image.LANCZOS)
ix, iy = 90, (H - S) // 2

# 阴影
shadow = Image.new("RGBA", (S + 40, S + 40), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle([14, 20, S + 14, S + 20], radius=52, fill=(0, 20, 30, 120))
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
img.alpha_composite(shadow, (ix - 20, iy - 20))

# 白边 + 圆角遮罩
frame = Image.new("RGBA", (S + 16, S + 16), (0, 0, 0, 0))
fd = ImageDraw.Draw(frame)
fd.rounded_rectangle([0, 0, S + 15, S + 15], radius=50, fill=(255, 255, 255, 255))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=44, fill=255)
icon.putalpha(mask)
frame.alpha_composite(icon, (8, 8))
img.alpha_composite(frame, (ix - 8, iy - 8))

# ---- 文字 ----
tx = 360
white = (255, 255, 255, 255)
title_f = font(86)
draw.text((tx, 196), "五菱车控", font=title_f, fill=white)

sub_f = font(34)
draw.text((tx, 300), "车辆远程助手 · 完全开源免费", font=sub_f, fill=(235, 245, 248, 235))

# 版本徽章
badge_f = font(28)
btxt = "Android · v119 4.3.0"
bw = draw.textlength(btxt, font=badge_f) + 40
bx, by = tx, 372
draw.rounded_rectangle([bx, by, bx + bw, by + 52], radius=26, fill=(6, 26, 34, 155))
draw.text((bx + 20, by + 11), btxt, font=badge_f, fill=white)

# 底部功能标签
tags = ["状态总览", "远程控车", "充电管理", "能耗统计", "位置找车", "无感控车"]
tag_f = font(22)
cx2 = tx
cy = 470
for t in tags:
    tw = draw.textlength(t, font=tag_f) + 30
    draw.rounded_rectangle([cx2, cy, cx2 + tw, cy + 44], radius=22, outline=(255, 255, 255, 90), width=2)
    draw.text((cx2 + 15, cy + 9), t, font=tag_f, fill=(240, 250, 252, 240))
    cx2 += tw + 12

img.convert("RGB").save("/workspace/wuling-site/og-image.png", "PNG", quality=95)
print("ok -> og-image.png", img.size)
