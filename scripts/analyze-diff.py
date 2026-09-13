#!/usr/bin/env python3
"""EMF 渲染差异分析工具。

对 out/emf-diff-*/ 目录里的 <base>.ours.png / <base>.ref.png 做定量诊断：
  - 全局最优平移偏移（判断是否存在 1px 级系统性错位）
  - 忽略边缘带后的差异（判断差异是否集中在细边带）
  - 差异集中度（差异像素占比）

用法：
  python3 scripts/analyze-diff.py <diffDir> [--top N] [--shift]
"""
import sys
import os
import json
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def load(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(np.int16)


def rmse(a, b):
    d = (a.astype(np.float32) - b.astype(np.float32)) / 255.0
    return float(np.sqrt((d * d).mean()))


def best_shift(a, b, r=3):
    """粗粒度搜索最优整数平移（在 b 上平移），返回 (dx, dy, rmse)。"""
    best = (0, 0, rmse(a, b))
    h, w = a.shape[:2]
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx == 0 and dy == 0:
                continue
            ys = slice(max(0, dy), min(h, h + dy))
            xs = slice(max(0, dx), min(w, w + dx))
            ys2 = slice(max(0, -dy), min(h, h - dy))
            xs2 = slice(max(0, -dx), min(w, w - dx))
            v = rmse(a[ys, xs], b[ys2, xs2])
            if v < best[2]:
                best = (dx, dy, v)
    return best


def edge_band_stats(a, b):
    """统计差异在“边缘带”上的占比：用差异图做 3x3 腐蚀，得到非细边带的差异量。"""
    diff = np.abs(a.astype(np.float32) - b.astype(np.float32)).max(axis=2) / 255.0
    strong = diff > 0.10
    if strong.sum() == 0:
        return 0.0, 0.0
    # 3x3 腐蚀：仅当邻域全为 strong 才保留 → 剔除 1-2px 细边带
    e = strong.copy()
    for ax in (0, 1):
        e = e & np.roll(strong, 1, axis=ax) & np.roll(strong, -1, axis=ax)
    return float(strong.mean()), float(e.mean())


def main():
    diff_dir = sys.argv[1]
    top = 20
    do_shift = False
    for i, a in enumerate(sys.argv):
        if a == '--top':
            top = int(sys.argv[i + 1])
        if a == '--shift':
            do_shift = True
    rep = {}
    rp = os.path.join(diff_dir, 'report.json')
    if os.path.exists(rp):
        for r in json.load(open(rp)):
            rep[r['base']] = r
    bases = sorted({f.split('.')[0] for f in os.listdir(diff_dir)
                    if f.endswith('.ours.png')})
    rows = []
    for b in bases:
        o = os.path.join(diff_dir, b + '.ours.png')
        rf = os.path.join(diff_dir, b + '.ref.png')
        if not (os.path.exists(o) and os.path.exists(rf)):
            continue
        a, c = load(o), load(rf)
        if a.shape != c.shape:
            rows.append((9.9, b, 'size-mismatch ' + str(a.shape) + str(c.shape), None))
            continue
        r = rmse(a, c)
        sfrac, efrac = edge_band_stats(a, c)
        sh = best_shift(a, c) if do_shift else None
        rows.append((r, b, f'strong={sfrac*100:5.1f}% thick={efrac*100:4.2f}%', sh))
    rows.sort(reverse=True, key=lambda x: x[0])
    print(f'{"base":10} {"rmse":>8}  strong%   thick%   bestShift(dx,dy,rmse)')
    for r, b, extra, sh in rows[:top]:
        s = f'{sh}' if sh and sh[2] < r * 0.9 else ''
        print(f'{b:10} {r:8.4f}  {extra}  {s}')
    print(f'\n样本 {len(rows)}  均值 {np.mean([r[0] for r in rows]):.4f}  中位 {np.median([r[0] for r in rows]):.4f}')


if __name__ == '__main__':
    main()
