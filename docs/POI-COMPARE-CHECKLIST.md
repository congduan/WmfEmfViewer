# POI 渲染实现对比 Checklist

参考实现：Apache POI `poi-scratchpad`（源码 sparse-checkout 至 `.reference/poi-src/poi-scratchpad/src/main/java/org/apache/poi/`，hwmf/hemf 全量 69 文件）。
本项目：`src/modules/drawers/emfDrawer.js`、`wmfDrawer.js`、`emfPlusDrawer.js`、`emfPlusParser.js`、`src/utils/coordinateTransformer.js`、`gdiObjectManager.js`、`baseDrawer.js`。

对比标记：✅ 一致 / ⚠️ 实现近似或存疑 / ❌ 缺失或错误 / ➖ POI 也未实现。
对比日期：2026-09-11。关键严重结论已人工复核源码确认。

## A. EMF 绘图记录（POI: HemfDraw.java ↔ emfDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| A1 | Poly* 记录族（2-8 + 16 位 55-5C） | ✅ | 字段布局均 Bounds(16)+Count(4)+Points[]；16 位每点 4 字节，PolyPolygon 子计数与闭合语义一致（HemfDraw.java:135-632 / emfDrawer.js:396-758） |
| A2 | POLYDRAW/POLYDRAW16 点类型标志 | ✅ 已修复(09-11) | POI 按 `mode&0x06`（2=LINETO/4=BEZIERTO/6=MOVETO）+`&0x01` 闭合（HemfDraw.java:978-1025）；本项目用 `type&1` 判 MOVETO → **PT_MOVETO 被误当 LINETO、BEZIERTO 丢弃**（emfDrawer.js:2162-2188、760-779） |
| A3 | MoveToEx 仅移动；LineTo/PolyTo 从 currentPos 起步 | ✅ | 两边语义一致 |
| A4 | Ellipse/Rectangle/RoundRect | ✅ | 字段布局与"当前 pen+brush"一致；圆角半径取 cornerWidth/2 对齐 GDI 直径语义 |
| A5 | Arc/Chord/Pie/ArcTo/AngleArc | ✅ ARCTO已修复(09-11) | Arc/Chord/Pie 一致（近似角度换算）；**EMR_ARCTO 错误：画整圆、忽略起止点、不接当前路径、不更新 currentPos**（emfDrawer.js:2142-2160；POI HemfDraw.java:913-947）；AngleArc/SetArcDirection POI 未实现，本项目自行实现 ➖ |
| A6 | 路径状态机 BeginPath/EndPath/… | ⚠️ | 本项目绘图记录立即 beginPath+stroke，BeginPath 后不累积进 bracket，StrokePath/FillPath 只对最近路径生效（emfDrawer.js:1089-1137）；POI 用 prop.path 累积（HemfDraw.java:1096-1218）。StrokeAndFillPath 有"灰色 fill 跳过"的 Excel 特判，偏离 POI |
| A7 | SetPixelV | ✅ | Point(8)+Color(4) 一致 |
| A8 | SelectObject / stock 对象 | ⚠️ | 0x80000000 高位处理一致；但**两套 stock 表冲突**：gdiObjectManager.js:75-88（DKGRAY=#808080、NULL_BRUSH=#ffffff）vs emfDrawer.js:368-389（DKGRAY=#404040、NULL_BRUSH=transparent），且缺 0x0A-0x13 字体 stock 对象 |

## B. EMF 状态与坐标（POI: HemfMisc/HemfWindowing/HwmfMapMode ↔ emfDrawer.js + coordinateTransformer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| B1 | SetMapMode 换算 | ✅ | LOMETRIC/HIMETRIC/LOENGLISH/HIENGLISH/TWIPS/POINTS 换算系数与 Y 翻转均与 HwmfMapMode.java:36-114 等价（coordinateTransformer.js:222-265） |
| B2 | Window/Viewport Ext/Org + Scale*ExtEx | ✅ Scale已修复(09-11) | Ext 覆盖语义、除零保护一致；**ScaleViewportExtEx/ScaleWindowExtEx 是空操作**（emfDrawer.js:1819-1837 仅 log），POI 按 w*scale 累乘（HemfWindowing.java:248-287）→ 自定义 viewport 缩放丢失 |
| B3 | World transform | ✅ | 行向量约定、MWT_IDENTITY/SET/LEFT/RIGHT 四模式、world→window/viewport 复合顺序均一致（coordinateTransformer.js:115-212 / HemfMisc.java:819-834） |
| B4 | SaveDC/RestoreDC | ✅ 负计数已修复(09-11) | **负计数语义错误**：`(savedDC>>>0)+1` 对 -1 变 4294967296→弹空整个栈；POI 明确 -1=弹 1 层、-2=弹 2 层（HemfMisc.java:179-199；emfDrawer.js:958-973）。且 _captureDcState 未保存 bkMode/rop2/textAlign/clip |
| B5 | 裁剪 | ❌/⚠️ | IntersectClipRect 矩形 clip 可用；**ExcludeClipRgn/OffsetClipRgn/SetMetaRgn 为空操作、SelectClipPath 仅 RGN_COPY 生效**（emfDrawer.js:1774-1785、2252-2260）；POI 用 Area 真 region 运算（HemfWindowing.java:294-330） |
| B6 | SetRop2/SetBkMode/SetStretchBltMode 等 | ⚠️/❌ | PolyFillMode→fillRule、SetMiterLimit 生效 ✅；**SetRop2/SetBkMode 仅记录无渲染影响**（emfDrawer.js:1139-1151）；SetColorAdjustment 空操作（POI 亦 Unimplemented ➖） |
| B7 | SetBrushOrgEx | ➖ | 两边均未实现（POI 无 draw），影响低 |

## C. EMF 对象记录（POI: HemfMisc/HemfPenStyle ↔ emfDrawer.js + gdiObjectManager.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| C1 | CreatePen | ✅ | ihPen(0)/style(4)/width(8)/widthY(12 忽略)/color(16) 一致 |
| C2 | CreateBrushIndirect | ✅ | style/color/hatch 布局一致；BS_NULL 透明、BS_HATCHED hatch 别名近似 |
| C3 | ExtCreatePen | ⚠️ | 基础字段一致；**未解析 offBmi/offBits、numStyleEntries/styleEntry 用户虚线数组、DIB 位图**（emfDrawer.js:781-801；POI HemfMisc.java:560-644） |
| C4 | CreateDibPatternBrushPt / CreateMonoBrush | ⚠️/❌ | DibPatternBrushPt 正确；**CreateMonoBrush 仅建黑刷、忽略 DIB 与偏移**（emfDrawer.js:1719-1723；POI 861-950） |
| C5 | DeleteObject / 句柄复用 | ✅ | Map 删除+同句柄覆盖复用一致 |
| Bk | Pen style 解码 | ⚠️ | 取 `style&0xF` 近似 dash；**未区分 PS_COSMETIC 固定 1px**（emfDrawer.js:309-347）；POI HwmfPenStyle/HemfPenStyle 完整解析类型/端点/连接/虚线 |

## D. EMF 文本（POI: HemfText.java ↔ emfDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| D1 | ExtTextOutW/A EMRTEXT 布局 | ✅ | reference/Chars/offString(-8)/Options/rcl/offDx 偏移完全对齐（emfDrawer.js:1242-1269 / HemfText.java:97-133）；ANSI 代码页未按 charset 区分 ⚠️ |
| D2 | offDx 字符间距 | ✅ 已修复(09-11) | **完全未读 offDx**，整串单次 fillText；POI 逐字符按 dx[] 排布（HemfText.java:141-169、227） |
| D3 | SetTextAlign | ✅ | 位值映射正确：`&0x0006`（left/right/center）、`&0x0018`（top/bottom/baseline）；TA_UPDATECP/TA_RTLREADING 未处理 ⚠️ |
| D4 | ETO_OPTIONS | ⚠️/❌ | ETO_OPAQUE ✅；**ETO_CLIPPED 未用 rcl 裁剪、ETO_GLYPH_INDEX 未识别** |
| D5 | ExtCreateFontIndirectW | ✅ | LOGFONTW 偏移一致；负 height→em height、weight≥700→bold、escapement 旋转方向均与 POI 一致 |
| D6 | SmallTextOut | ⚠️ | 已实现（NO_RECT/SMALL_CHARS/OPAQUE）；ETO_CLIPPED 未裁剪；POI 该记录本身未实现 ➖ |
| D7 | SetTextColor | ✅ | 一致 |

## E. EMF 区域与调色板（POI: HemfFill/HemfPalette ↔ emfDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| E1 | Region 解析（RDH+rects） | ❌ | 完全无 region 存储；POI readRgnData 解析为 Rectangle2D 列表再合成 Area（HemfFill.java:809、878） |
| E2 | FillRgn/FrameRgn/PaintRgn/InvertRgn | ❌ | 分派表全部 null（emfDrawer.js:125-128）；POI 逐矩形 fill/描边 |
| E3 | ExtSelectClipRgn | ❌ | null；POI 支持 RGN_AND/OR/XOR/DIFF/COPY 真 clip（HemfFill.java:501） |
| E4 | ExtFloodFill | ⚠️ | 本项目仅解析不绘制（emfDrawer.js:2132）；POI 有近似 draw 实现 |
| E5 | 调色板 | ❌ | CreatePalette/SelectPalette/RealizePalette 全为 console.log 空实现；**_decodeDib 从不引用逻辑调色板 → DIB_PAL_COLORS 位图颜色错误**（emfDrawer.js:2109-2130、1370） |

## F. EMF 位图/BLT（POI: HemfFill/HwmfBitmapDib ↔ emfDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| F1 | BitBlt/StretchBlt | ⚠️ | 布局一致；仅处理 BLACKNESS/WHITENESS，其余 ROP 忽略；DIB 缺失时 POI 用 brush xorPat 画块、本项目不绘制 |
| F2 | StretchDiBits / SetDiBitsToDevice | ⚠️/❌ | StretchDiBits 布局一致（源矩形裁剪简化）；**SetDiBitsToDevice 未实现**（POI 已实现，HemfFill.java:683） |
| F3 | DIB 解码 | ⚠️ | 1-32bpp/RLE8/RLE4/top-down/透明键/alpha 均支持，覆盖面与 POI 相当；**BI_BITFIELDS 不读真实掩码、16bpp 硬编码 5-5-5**（emfDrawer.js:1394、1422） |
| F4 | AlphaBlend/TransparentBlt | ✅ 反超 | POI 均未渲染（AlphaBlend 无 draw、TransparentBlt 无实现），本项目已实现 |

## G. EMF+（POI: hemf/record/emfplus/* ↔ emfPlusParser.js + emfPlusDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| G1 | GDICOMMENT→EMF+ 提取 | ✅ | DataSize(4)+'EMF+'(0x2B464D45)+多记录流 12 字节头切分，与 HemfComment.java:344-359 一致 |
| G2 | 记录头/续记录 | ⚠️ | Type/Flags/Size/DataSize 切分对齐 HemfPlusRecordIterator.java:63-95；**Continued（CONTINUABLE 0x8000/TotalObjectSize）未拼接**，超大对象错位 |
| G3 | EmfPlusObject/Brush | ⚠️ | ObjectId 位拆分一致；**仅 Solid，其余类型启发式取首个不透明 ARGB，Hatch(2) 漏掉**（emfPlusDrawer.js:918-928） |
| G4 | EmfPlusPen 字段 | ✅ 已修复(09-11) | **4 字节错位**（已人工复核 POI HemfPlusPen.java:391-408）：POI 顺序 type(0)+penDataFlags(4)+unitType(8)+penWidth(12)；本项目把 penDataFlags 当 unit、unitType 当 width、penWidth 当 ARGB（emfPlusDrawer.js:931-946）→ 所有 EMF+ 画笔 width/color 错 |
| G5 | PageTransform/容器栈 | ❌ | SetPageTransform/Save/Restore/BeginContainer 全为空 stub（emfPlusDrawer.js:806-866）；POI 应用 unit 缩放与容器 dst/src 比例 |
| G6 | DrawString | ⚠️ | 布局与 flags&0x8000 取色一致；字体度量用 `_emfPlusUnitsToPx` 近似，无 StringFormat/字距 |
| G7 | FillRegion/ClosedCurve/DrawCurve/Beziers/DrawArc | ❌ | 全是 console.log 空 stub；ClosedCurve/Curve 张力公式（t×2/3）未实现 |
| G8 | DrawImage/DrawImagePoints | ✅ DrawImage已修复(09-11) | **DrawImage 只读 SourceRect、漏读目标 RectF**（画到源坐标位置）；ImageAttributes/UnitType 忽略；PNG/JPEG+内嵌 EMF 支持 |

## H. WMF（POI: hwmf/record/* ↔ wmfDrawer.js + wmfParser.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| H1 | Placeable header | ⚠️ | 字段解析正确；**inch(unitsPerInch) 未参与缩放**，仅用默认 pxPerMm |
| H2 | MapMode | ✅ | 五固定模式缩放与 Y 翻转公式与 HwmfMapMode.java:36-89 一致 |
| H3 | 绘图记录布局 | ✅ | Rectangle/Arc/Pie/Chord 16 位布局与 atan2 求角一致 |
| H4 | DIBBitBlt/DibStretchBlt/StretchDib | ✅ | 参数读取与 ROP 位置、DIB 偏移一致 |
| H5 | ExtTextOut | ⚠️ | Options/Dx/CLIPPED 处理较完整；**ETO_OPAQUE 不填充背景矩形** |
| H6 | CreateRegion/FillRegion | ❌ | processCreateRegion 在 baseDrawer 仅 console.log 兜底（非崩溃）；FillRegion 未实现；region 扫描线/矩形格式未解析 |
| H7 | Escape | ⚠️ | 仅处理 MFCOMMENT/MathType，其余类型忽略 |
| H8 | ROP 组合 | ❌/➖ | SetROP2 仅日志；Canvas 无光栅 op，未做近似（POI 有 HwmfROP2/ROP3Composite） |

## 对比结论汇总（按影响排序）

### 一、明确的字段级 Bug（✅ 1-5 已于 2026-09-11 全部修复，见 commit 27a24a3）
1. ❌ **B4 RestoreDC 负计数**：`-1` 弹空整个状态栈，破坏后续所有记录状态（emfDrawer.js:962）。
2. ❌ **G4 EmfPlusPen 4 字节错位**：所有 EMF+ 画笔 width/color 解析错误（emfPlusDrawer.js:931-946）。
3. ❌ **A2 POLYDRAW 点类型解码错**：MOVETO↔LINETO 判反、BEZIERTO 丢弃（emfDrawer.js:2162-2188、760-779）。
4. ❌ **A5 EMR_ARCTO**：画整圆、忽略起止点、不接路径（emfDrawer.js:2142-2160）。
5. ❌ **G8 DrawImage 漏读目标 RectF**：画到源坐标位置（emfPlusDrawer.js:469-479）。

### 二、整块缺失（高价值）
6. ❌ E1-E3 region 记录全链（解析+FillRgn/FrameRgn/ExtSelectClipRgn clip）。
7. ❌ E5 调色板链路（CreatePalette→_decodeDib DIB_PAL_COLORS）。
8. ❌ G5 EMF+ PageTransform/容器栈（坐标无单位换算）。
9. ❌ B2 Scale*ExtEx 空操作；B5 Exclude/OffsetClipRgn/SetMetaRgn 空操作。
10. ❌ D2 offDx 字符间距。

### 三、近似可接受 / 低优先
- A6 路径 bracket 不累积、A8 stock 表冲突、C3/C4 styleEntry/MonoBrush、Bk COSMETIC 线宽、
- F1 ROP/xorPat、F2 SetDiBitsToDevice、F3 BI_BITFIELDS 掩码、G2 续记录、G3 Hatch 刷、G7 曲线族 stub、
- H1 inch 缩放、H5 OPAQUE 背景矩形、H6/H8 region 与 ROP。
- 本项目反超 POI 的点：AlphaBlend/TransparentBlt（F4）、AngleArc/SetArcDirection（A5）、SmallTextOut（D6）。

### 修复进度
- ✅ 第一梯队 1-5 全部修复（commit 27a24a3，2026-09-11）
- ✅ 第二梯队 9（Scale*ExtEx）、10（offDx）已修复；8（EMF+ 单位换算）未做——
  注意：pen 宽度单位换算经实测为负收益（POI 亦未做，留 TODO），已改为原始宽度直出 +
  SvgContext 线宽钳制防御（>2×画布对角线，规避 rsvg 裁剪失效灰边）。
- ⬜ 第三梯队 6/7（region 与调色板，需引入 region 数据结构）待做。
- 门禁：快照 632/632（已更新基线）、lint 0 error、语料解析率不变、RMSE 0.1184→0.1199（噪声级，
  test-131 等 offDx 文件标签位置改为文件声明字距，视觉无差异）。
