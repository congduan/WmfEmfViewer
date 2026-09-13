#!/usr/bin/env python3
"""对比输出与参考实现（libemf2svg）文本的有效字号/位置，推导字号换算系数。

从 <base>.ours.svg 的 <text> 提取 (x, y, font-size, transform matrix)，
计算经 matrix 后的有效坐标与有效字号；再与 <base>.ref.svg 的 (x, y, font-size) 比较。

用法：python3 scripts/analyze-text.py <diffDir> [--top N]
"""
import sys
import os
import re
import json
import statistics

MAT = re.compile(r'matrix\(([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)\)')
TEXT = re.compile(r'<text\b([^>]*)>(.*?)</text>', re.S)
ATTR = re.compile(r'(\w[\w-]*)="([^"]*)"')


def our_texts(p):
    s = open(p, encoding='utf8').read()
    out = []
    for m in TEXT.finditer(s):
        a = dict(ATTR.findall(m.group(1)))
        x, y = float(a.get('x', 0)), float(a.get('y', 0))
        fs = float(a.get('font-size', 0))
        mm = MAT.search(a.get('transform', ''))
        if mm:
            aa, bb, cc, dd, ee, ff = (float(v) for v in mm.groups())
        else:
            aa, bb, cc, dd, ee, ff = 1.0, 0, 0, 1.0, 0, 0
        ex, ey = aa * x + cc * y + ee, bb * x + dd * y + ff
        # 字形在 SVG 中按本地坐标绘制，横向被 |a| 缩放、纵向被 |d| 缩放。
        # 注意：不要把 b（旋转/切变项，通常为 0）混进纵向量度 —— 早期版本
        # 用 (|b|+|d|)/2 导致纵向量度被系统性低估一半，得出"字号偏小 2.35×"的错误结论。
        out.append((ex, ey, fs * abs(dd), fs * abs(aa), m.group(2)[:40]))
    return out


def ref_texts(p):
    s = open(p, encoding='utf8').read()
    out = []
    for m in TEXT.finditer(s):
        a = dict(ATTR.findall(m.group(1)))
        out.append((float(a.get('x', 0)), float(a.get('y', 0)), float(a.get('font-size', 0)), m.group(2)[:40]))
    return out


def main():
    d = sys.argv[1]
    n = 15
    if '--top' in sys.argv:
        n = int(sys.argv[sys.argv.index('--top') + 1])
    rp = os.path.join(d, 'report.json')
    rm = {}
    if os.path.exists(rp):
        for r in json.load(open(rp)):
            try:
                rm[r['base']] = float(r['rmse'])
            except Exception:
                pass
    bases = sorted(rm, key=lambda b: -rm[b])[:n]
    ratios = []
    print(f'{"base":10} {"rmse":>7}  {"ourV":>8} {"ourH":>8} {"refFS":>8} {"rV":>7} {"rH":>7}  sample')
    for b in bases:
        o = os.path.join(d, b + '.ours.svg')
        r = os.path.join(d, b + '.ref.svg')
        if not (os.path.exists(o) and os.path.exists(r)):
            continue
        ot, rt = our_texts(o), ref_texts(r)
        if not ot or not rt:
            print(f'{b:10} {rm[b]:7.4f}  (no text: ours={len(ot)} ref={len(rt)})')
            continue
        # 取首个有效字号>0 的对
        pair = None
        for i in range(min(len(ot), len(rt))):
            if ot[i][2] > 0 and rt[i][2] > 0:
                pair = (ot[i], rt[i])
                break
        if not pair:
            continue
        (ox, oy, ov, oh, os_), (rx, ry, rfs, rs) = pair
        rv = rfs / ov if ov else 0
        rh = rfs / oh if oh else 0
        ratios.append(rv)
        same = os_[:18] == rs[:18]
        print(f'{b:10} {rm[b]:7.4f}  {ov:8.3f} {oh:8.3f} {rfs:8.3f} {rv:7.4f} {rh:7.4f}  {"=" if same else "!"} {rs[:24]!r}')
    if ratios:
        print(f'\n垂直ratio 中位 {statistics.median(ratios):.4f}  均值 {statistics.mean(ratios):.4f}  n={len(ratios)}')


if __name__ == '__main__':
    main()
