# 渲染实现对比 Checklist

对比基准：一套独立的第三方 WMF/EMF/EMF+ 实现（hwmf/hemf 模块，共 69 个源文件）。
本项目：`src/modules/drawers/emfDrawer.js`、`wmfDrawer.js`、`emfPlusDrawer.js`、`emfPlusParser.js`、`src/utils/coordinateTransformer.js`、`gdiObjectManager.js`、`baseDrawer.js`。

对比标记：✅ 一致 / ⚠️ 实现近似或存疑 / ❌ 缺失或错误 / ➖ 参考实现亦未实现。
对比日期：2026-09-11。关键严重结论已人工复核源码确认。

## A. EMF 绘图记录（emfDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| A1 | Poly* 记录族（2-8 + 16 位 55-5C） | ✅ | 字段布局均 Bounds(16)+Count(4)+Points[]；16 位每点 4 字节，PolyPolygon 子计数与闭合语义一致（emfDrawer.js:396-758） |
| A2 | POLYDRAW/POLYDRAW16 点类型标志 | ✅ 已修复(09-11) | 按 `mode&0x06`（2=LINETO/4=BEZIERTO/6=MOVETO）+`&0x01` 闭合；本项目曾用 `type&1` 判 MOVETO → **PT_MOVETO 被误当 LINETO、BEZIERTO 丢弃**（emfDrawer.js:2162-2188、760-779） |
| A3 | MoveToEx 仅移动；LineTo/PolyTo 从 currentPos 起步 | ✅ | 语义一致 |
| A4 | Ellipse/Rectangle/RoundRect | ✅ | 字段布局与"当前 pen+brush"一致；圆角半径取 cornerWidth/2 对齐 GDI 直径语义 |
| A5 | Arc/Chord/Pie/ArcTo/AngleArc | ✅ ARCTO已修复(09-11) | Arc/Chord/Pie 一致（近似角度换算）；**EMR_ARCTO 错误：画整圆、忽略起止点、不接当前路径、不更新 currentPos**（emfDrawer.js:2142-2160）；AngleArc/SetArcDirection 参考实现未实现，本项目自行实现 ➖ |
| A6 | 路径状态机 BeginPath/EndPath/… | ⚠️ | 本项目绘图记录立即 beginPath+stroke，BeginPath 后不累积进 bracket，StrokePath/FillPath 只对最近路径生效（emfDrawer.js:1089-1137）；参考实现用 prop.path 累积。StrokeAndFillPath 有"灰色 fill 跳过"的 Excel 特判，偏离参考实现 |
| A7 | SetPixelV | ✅ | Point(8)+Color(4) 一致 |
| A8 | SelectObject / stock 对象 | ⚠️ | 0x80000000 高位处理一致；但**两套 stock 表冲突**：gdiObjectManager.js:75-88（DKGRAY=#808080、NULL_BRUSH=#ffffff）vs emfDrawer.js:368-389（DKGRAY=#404040、NULL_BRUSH=transparent），且缺 0x0A-0x13 字体 stock 对象 |
| A9 | EMR_GRADIENTFILL | ✅ 已实现(10-25) | 此前分派表为 null。RECT_H/RECT_V 用 SVG 线性渐变精确表达；TRIANGLE（Gouraud）SVG 无对应图元，用「色差最大顶点→对边中点」线性渐变近似。两处实测反常识细节：顶点色是 **COLOR16（0..65535）**、**Alpha 恒为 0 且必须忽略**（按透明处理整块会消失）。索引为 4 字节 ULONG，矩形模式每矩形 2 个、三角形每片 3 个 |

## B. EMF 状态与坐标（emfDrawer.js + coordinateTransformer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| B1 | SetMapMode 换算 | ✅ | LOMETRIC/HIMETRIC/LOENGLISH/HIENGLISH/TWIPS/POINTS 换算系数与 Y 翻转均等价（coordinateTransformer.js:222-265） |
| B2 | Window/Viewport Ext/Org + Scale*ExtEx | ✅ Scale已修复(09-11) | Ext 覆盖语义、除零保护一致；**ScaleViewportExtEx/ScaleWindowExtEx 是空操作**（emfDrawer.js:1819-1837 仅 log），参考实现按 w*scale 累乘 → 自定义 viewport 缩放丢失 |
| B3 | World transform | ✅ | 行向量约定、MWT_IDENTITY/SET/LEFT/RIGHT 四模式、world→window/viewport 复合顺序均一致（coordinateTransformer.js:115-212） |
| B4 | SaveDC/RestoreDC | ✅ 负计数已修复(09-11) | **负计数语义错误**：`(savedDC>>>0)+1` 对 -1 变 4294967296→弹空整个栈；参考实现明确 -1=弹 1 层、-2=弹 2 层（emfDrawer.js:958-973）。且 _captureDcState 未保存 bkMode/rop2/textAlign/clip |
| B5 | 裁剪 | ❌/⚠️ | IntersectClipRect 矩形 clip 可用；**ExcludeClipRgn/OffsetClipRgn/SetMetaRgn 为空操作、SelectClipPath 仅 RGN_COPY 生效**（emfDrawer.js:1774-1785、2252-2260）；参考实现用 Area 真 region 运算 |
| B6 | SetRop2/SetBkMode/SetStretchBltMode 等 | ⚠️/❌ | PolyFillMode→fillRule、SetMiterLimit 生效 ✅；**SetRop2/SetBkMode 仅记录无渲染影响**（emfDrawer.js:1139-1151）；SetColorAdjustment 空操作（参考实现亦 Unimplemented ➖） |
| B7 | SetBrushOrgEx | ➖ | 两边均未实现（参考实现无 draw），影响低 |

## C. EMF 对象记录（emfDrawer.js + gdiObjectManager.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| C1 | CreatePen | ✅ | ihPen(0)/style(4)/width(8)/widthY(12 忽略)/color(16) 一致 |
| C2 | CreateBrushIndirect | ✅ | style/color/hatch 布局一致；BS_NULL 透明、BS_HATCHED hatch 别名近似 |
| C3 | ExtCreatePen | ⚠️ | 基础字段一致；**未解析 offBmi/offBits、numStyleEntries/styleEntry 用户虚线数组、DIB 位图**（emfDrawer.js:781-801） |
| C4 | CreateDibPatternBrushPt / CreateMonoBrush | ⚠️/❌ | DibPatternBrushPt 正确；**CreateMonoBrush 仅建黑刷、忽略 DIB 与偏移**（emfDrawer.js:1719-1723） |
| C5 | DeleteObject / 句柄复用 | ✅ | Map 删除+同句柄覆盖复用一致 |
| Bk | Pen style 解码 | ⚠️ | 取 `style&0xF` 近似 dash；**未区分 PS_COSMETIC 固定 1px**（emfDrawer.js:309-347）；参考实现完整解析类型/端点/连接/虚线 |

## D. EMF 文本（emfDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| D1 | ExtTextOutW/A EMRTEXT 布局 | ✅ | reference/Chars/offString(-8)/Options/rcl/offDx 偏移完全对齐（emfDrawer.js:1242-1269）；ANSI 代码页未按 charset 区分 ⚠️ |
| D2 | offDx 字符间距 | ✅ 已修复(09-11) | **完全未读 offDx**，整串单次 fillText；参考实现逐字符按 dx[] 排布 |
| D3 | SetTextAlign | ✅ | 位值映射正确：`&0x0006`（left/right/center）、`&0x0018`（top/bottom/baseline）；TA_UPDATECP/TA_RTLREADING 未处理 ⚠️ |
| D4 | ETO_OPTIONS | ⚠️/❌ | ETO_OPAQUE ✅；**ETO_CLIPPED 未用 rcl 裁剪、ETO_GLYPH_INDEX 未识别** |
| D5 | ExtCreateFontIndirectW | ✅ | LOGFONTW 偏移一致；负 height→em height、weight≥700→bold、escapement 旋转方向均一致 |
| D6 | SmallTextOut | ⚠️ | 已实现（NO_RECT/SMALL_CHARS/OPAQUE）；ETO_CLIPPED 未裁剪；参考实现该记录本身未实现 ➖ |
| D7 | SetTextColor | ✅ | 一致 |

## E. EMF 区域与调色板（emfDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| E1 | Region 解析（RDH+rects） | ✅ 已实现(09-11) | 完全无 region 存储；参考实现解析为 Rectangle2D 列表再合成 Area |
| E2 | FillRgn/FrameRgn/PaintRgn/InvertRgn | ✅ 已实现(09-11)（InvertRgn 参考实现亦未实现 ➖） | 分派表全部 null（emfDrawer.js:125-128）；参考实现逐矩形 fill/描边 |
| E3 | ExtSelectClipRgn | ✅ 已实现(09-11)（AND/COPY 精确，OR/XOR/DIFF 近似 COPY） | null；参考实现支持 RGN_AND/OR/XOR/DIFF/COPY 真 clip |
| E4 | ExtFloodFill | ⚠️ | 本项目仅解析不绘制（emfDrawer.js:2132）；参考实现有近似 draw 实现 |
| E5 | 调色板 | ✅ 已实现(09-11)（Create/Select/SetEntries + DIB_PAL_COLORS） | CreatePalette/SelectPalette/RealizePalette 全为 console.log 空实现；**_decodeDib 从不引用逻辑调色板 → DIB_PAL_COLORS 位图颜色错误**（emfDrawer.js:2109-2130、1370） |

## F. EMF 位图/BLT（emfDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| F1 | BitBlt/StretchBlt | ⚠️ | 布局一致；仅处理 BLACKNESS/WHITENESS，其余 ROP 忽略；DIB 缺失时参考实现用 brush xorPat 画块、本项目不绘制 |
| F2 | StretchDiBits / SetDiBitsToDevice | ⚠️/❌ | StretchDiBits 布局一致（源矩形裁剪简化）；**SetDiBitsToDevice 未实现**（参考实现已实现） |
| F3 | DIB 解码 | ⚠️ | 1-32bpp/RLE8/RLE4/top-down/透明键/alpha 均支持，覆盖面与参考实现相当；**BI_BITFIELDS 不读真实掩码、16bpp 硬编码 5-5-5**（emfDrawer.js:1394、1422） |
| F4 | AlphaBlend/TransparentBlt | ✅ 反超 | 参考实现均未渲染（AlphaBlend 无 draw、TransparentBlt 无实现），本项目已实现 |

## G. EMF+（emfPlusParser.js + emfPlusDrawer.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| G1 | GDICOMMENT→EMF+ 提取 | ✅ | DataSize(4)+'EMF+'(0x2B464D45)+多记录流 12 字节头切分，与参考实现一致 |
| G2 | 记录头/续记录 | ⚠️ | Type/Flags/Size/DataSize 切分一致；**Continued（CONTINUABLE 0x8000/TotalObjectSize）未拼接**，超大对象错位 |
| G3 | EmfPlusObject/Brush | ✅ 已实现(10-25) | Solid/Hatch/LinearGradient/PathGradient 四种按 MS-EMFPLUS 布局完整解析（渐变的 BrushDataPresetColors 色标位置精确还原）；渐变几何在使用时刻才映射，同一画刷在不同世界变换下不会串味。Texture(2) 需内嵌图像解码，保留主色兜底并记入 `unsupportedRecords` |
| G4 | EmfPlusPen 字段 | ✅ 已修复(09-11) | **4 字节错位**（已人工复核参考实现）：参考实现顺序 type(0)+penDataFlags(4)+unitType(8)+penWidth(12)；本项目曾把 penDataFlags 当 unit、unitType 当 width、penWidth 当 ARGB（emfPlusDrawer.js:931-946）→ 所有 EMF+ 画笔 width/color 错 |
| G5 | PageTransform/容器栈 | ✅ 已实现(10-25) | Save/Restore/BeginContainer/EndContainer/SetWorldTransform/Reset/Multiply/Translate/Scale/Rotate/SetPageTransform 全部实装；世界变换在 `_emfPlusMapPoint` 统一施加，故全部绘制记录自动受益。物理单位（point/inch/mm）的 PageScale 仍按 1 处理并记入 `unsupportedRecords` |
| G6 | DrawString | ✅ 已实现(10-25) | StringFormat 的 StringAlignment/LineAlign 已按规范换算生效：水平对齐交给 SVG `text-anchor`（用渲染器真实字体度量，优于 `measureText` 估算），垂直对齐在世界单位算偏移。leadingMargin/trailingMargin 取实值。tracking/trimming/tabStops/右到左/竖排仍为近似并记入 unsupportedRecords |
| G10 | StringFormat 对象（0x0700） | ✅ 已实现(10-25) | 语料实测 391 个对象，此前完全未解析。字段布局与 `emfpstringformat.cxx` 逐项对照；实测 leadingMargin/trailingMargin 全为 0、tracking 全为 1，但 **lineAlign 有 232 条不是 Near**，故垂直对齐是主要收益 |
| G7 | FillRegion/ClosedCurve/DrawCurve/Beziers/DrawArc | ❌ | 全是 console.log 空 stub；ClosedCurve/Curve 张力公式（t×2/3）未实现 |
| G8 | DrawImage/DrawImagePoints | ✅ DrawImage已修复(09-11) | **DrawImage 只读 SourceRect、漏读目标 RectF**（画到源坐标位置）；ImageAttributes/UnitType 忽略；PNG/JPEG+内嵌 EMF 支持 |
| G9 | 裁剪记录族（0x4031–0x4035） | ⚠️ 已实现(10-25) | ResetClip/SetClipRect/SetClipPath 精确（SvgContext 用嵌套 clipPath 表达交集）；CombineMode 仅 Replace/Intersect 精确，Union 无既有裁剪时精确、否则退化，Xor/Exclude/Complement 退化为交集——全部记入 `drawer.unsupportedRecords`。SetClipRegion 因 Region 对象未解析仍为近似 |

## H. WMF（wmfDrawer.js + wmfParser.js）

| # | 项目 | 对比结果 | 说明 |
|---|------|----------|------|
| H1 | Placeable header | ⚠️ | 字段解析正确；**inch(unitsPerInch) 未参与缩放**，仅用默认 pxPerMm |
| H2 | MapMode | ✅ | 五固定模式缩放与 Y 翻转公式一致 |
| H3 | 绘图记录布局 | ✅ | Rectangle/Arc/Pie/Chord 16 位布局与 atan2 求角一致 |
| H4 | DIBBitBlt/DibStretchBlt/StretchDib | ✅ | 参数读取与 ROP 位置、DIB 偏移一致 |
| H5 | ExtTextOut | ⚠️ | Options/Dx/CLIPPED 处理较完整；**ETO_OPAQUE 不填充背景矩形** |
| H6 | CreateRegion/FillRegion | ⬜ 待做（扫描线格式） | processCreateRegion 在 baseDrawer 仅 console.log 兜底（非崩溃）；FillRegion 未实现；region 扫描线/矩形格式未解析 |
| H7 | Escape | ⚠️ | 仅处理 MFCOMMENT/MathType，其余类型忽略 |
| H8 | ROP 组合 | ❌/➖ | SetROP2 仅日志；Canvas 无光栅 op，未做近似（参考实现已实现 ROP2/ROP3 合成） |

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
- 本项目反超参考实现的点：AlphaBlend/TransparentBlt（F4）、AngleArc/SetArcDirection（A5）、SmallTextOut（D6）。

### 修复进度
- ✅ 第一梯队 1-5 全部修复（commit 27a24a3，2026-09-11）
- ✅ 第二梯队 9（Scale*ExtEx）、10（offDx）已修复；8（EMF+ 单位换算）未做——
  注意：pen 宽度单位换算经实测为负收益（参考实现亦未做，留 TODO），已改为原始宽度直出 +
  SvgContext 线宽钳制防御（>2×画布对角线，规避 rsvg 裁剪失效灰边）。
- ✅ 第三梯队 6/7 已完成（2026-09-11）：region 解析（RDH+rects，_readRgnData）、FillRgn/FrameRgn/PaintRgn、
  ExtSelectClipRgn（RGN_AND/COPY 精确、OR/XOR/DIFF 近似）、调色板全链（CreatePalette/SelectPalette/
  SetPaletteEntries → _decodeDib DIB_PAL_COLORS，BLT 五记录均传 iUsageSrc）。
  语料验证：无 FILLRGN/FRAMERGN 样本；ExtSelectClipRgn 使 test-109 RMSE 0.0849→0.0574；
  test-164 等调色板文件位图均为 iUsage=0（链路已通、暂无收益样本）。
  RMSE 0.1199→0.1198；快照 632/632（2 个 hash 变化为 clip id 计数偏移，归一化后 SVG 全等）。
- 门禁：快照 632/632（已更新基线）、lint 0 error、语料解析率不变、RMSE 0.1184→0.1199（噪声级，
  test-131 等 offDx 文件标签位置改为文件声明字距，视觉无差异）。
- ✅ 第四梯队（2026-09-12）：GDI 路径记录语义 + 笔宽 world 缩放。
  1) BeginPath/EndPath 期间的 PolylineTo(16)/PolyBezierTo(16)/LINETO 改为只向当前路径追加线段
    （不再 beginPath()+stroke() 截断已累积子路径）；MoveToEx 在路径记录中开启新子路径
    （test-182 槽位圆角矩形曾退化为碎片段）。FILLPATH 后路径保留供 STROKEPATH 复用（SvgContext 语义已支持）。
  2) 笔宽随 world 变换缩放（getStrokeScale=√|det|，经 ctx.strokeScaleProvider 注入 SvgContext），
    仅 world 参与换算、window/viewport 比例不参与（world 变换作为 SVG matrix 输出时
    笔宽在 matrix 内被等比缩放；test-182 需 ×0.0625，test-027 ANISOTROPIC+单位 world 需 ×1）。
    EMF+ 回放期间旁路 provider（EMF+ 笔宽为设备单位）。
  3) RMSE 0.1198→0.1153；>0.3 仅剩 test-176（EXTTEXTOUTA 文本度量）。单文件：
    test-150 0.341→0.195、test-186 0.198→0.060、test-182 0.335→0.254、test-045/048 0.138→0.078。
    快照更新（描边合并进路径，SVG 更小）。
- ✅ 第五梯队（2026-10-25）：SvgContext 表达力 + EMF+ 状态栈/变换/裁剪。
  1) SvgContext 补齐 Canvas 子集：`createLinearGradient` / `createRadialGradient` /
     `createPattern`、`translate` / `rotate` / `transform` / `setTransform` / `resetTransform`
     （用嵌套 `<g transform>` 实现，坐标仍由绘制层烘焙）、`clip()` 改为**嵌套 clipPath** 表达
     交集（原实现直接覆盖，连续 IntersectClipRect 会丢失累积裁剪）、`quadraticCurveTo` /
     `arcTo` / `strokeText` / `clearRect`、`setLineDash` 的 offset、`globalAlpha` →
     fill/stroke-opacity、`letterSpacing` / `wordSpacing`。
     除 clip 外全部是「缺省时不输出」的增补，不改动既有输出。
  2) EMF+ 的 12 条变换/容器记录（0x4025–0x4030）与 5 条裁剪记录（0x4031–0x4035）
     从 `null` 改为实装。世界变换只在 `_emfPlusMapPoint` 施加一次，故 40+ 个绘制处理器
     无需改动；单位矩阵走恒等路径，既有快照逐字节不变。
  3) 顺带修正两处真实 bug：
     - `_emfPlusComposeMatrix` 的 Prepend/Append 语义反了（Append 应为 A←B·A）。
       修正前 test-038 的 12 个角度标签绕原点公转并飞出画布；修正后锚点恒定为 (8000,300)，
       仅字形原地旋转——这才是该测试的意图。
     - `_emfPlusUnitsToPx` 用 x 轴投影量字高，世界变换含旋转时字号随 cosθ 抖动
       （90° 时投影为 0）；改为取映射向量的长度。
  4) 门禁：快照 632/632。clip 嵌套使 112 个文件 SVG 结构变化，经 rsvg 光栅化后
     RMSE 全部 = 0（纯结构修正）；test-038 及其损坏副本为真实修复
     （旧输出 "Clip/Intersect/Union/XOR" 四列完全未裁剪、旋转标签堆叠在同一点）。
     语料 EMF+ 记录实测覆盖：SetWorldTransform×3 / Translate×48 / Rotate×48 /
     SetPageTransform×3 / ResetClip×14 / SetClipRect×24 / SetClipPath×10（集中于 1 个文件）。
  5) 待办：Save / Restore / BeginContainer / EndContainer / ScaleWorldTransform /
     DrawDriverString 在语料中**无样本**，目前只有实现、没有回归验证；
     EMF+ 渐变刷的渲染接入是下一步（本期已备好 SvgContext 渐变 API）。

- ✅ 第六梯队（2026-10-25）：EMF+ 画刷全类型接入。
  1) 语料实测画刷分布（全语料，非估计）：Solid 3 / Hatch 212 / LinearGradient 54 /
     PathGradient 36 / Texture 2 —— 即 **305 个非纯色画刷此前全部被降级成单色**。
  2) 按 MS-EMFPLUS 2.2.2.10 / 2.2.2.14 完整解析：
     - LinearGradient：BrushDataFlags + RectF(起点+尺寸向量) + 双色 + 两个重复 ARGB
       + 可选 XForm/BlendFactors/PresetColors。PresetColors 的「位置数组 + 颜色数组」
       分离布局已还原（实测得到 blue→red 两档、magenta→gray→green 三档等正确色标）。
     - PathGradient：CenterColor + CenterPoint + SurroundColors[] + 可选边界路径；
       半径由边界路径包围盒半对角线推导，无路径时退化为中心纯色。
     - Hatch：53 种样式用 `<pattern>` 平铺。0-5 精确、6-17 按密度反推线距、
       18-33 为明暗/粗细/虚线变体、34-52 装饰类无对应图元统一退化为交叉网纹，
       全部近似项记入 unsupportedRecords。
  3) 关键设计：渐变/图案几何在**使用时刻**才映射（`_emfPlusBrushPaint` 以内联矩阵为缓存键）。
     EMF+ 的 Brush 坐标属于世界空间，同一画刷可能在多个变换下被使用，创建时烘焙会在
     变换改变后失真。这同时避免了 `<defs>` 里堆出同义渐变。
  4) 门禁：快照 632/632，仅 test-038 及其损坏副本变化。视觉核对：8× 放大可确认
     交叉网纹、棋盘格、渐变（含多档 preset 色标）均正确；path gradient 得到
     合理半径（如 r=477.78，中心落在画布 14030×9920 的合理位置）。
  5) 已知近似：hatch 单元格固定 8 用户单位、不随世界变换缩放；TextureFill 未实现；
     LinearGradient 的 BrushDataTransform 暂不参与几何。

- ✅ 第七梯队（2026-10-25）：按语料实测影响面排序，补齐四项。
  1) **EMF+ StringFormat（391 个对象，此前完全未解析）**。水平对齐改为输出
     SVG `text-anchor`——由渲染器用真实字体度量定位，优于 `measureText`
     （0.6×字号×字数）的估算；垂直对齐在世界单位算偏移后再映射，故旋转场景同样正确。
     语料实测：leadingMargin/trailingMargin 全为 0、tracking 全为 1，
     但 lineAlign 有 232 条不是 Near，垂直对齐是主要收益。
     验证：test-038 里这组文本的字面内容就是 `textalignment:<align>_<lineAlign>`，
     且由三个纵对齐档位反推出 layoutY=130 / layoutH=380 / em=40 完全自洽
     （Near 130+40=170、Center 130+190+20=340、Far 130+380=510）。
  2) **EMR_GRADIENTFILL（28 次 / 7 文件）**。RECT_H/RECT_V 用 SVG 线性渐变精确表达；
     TRIANGLE 用「色差最大顶点 → 对边中点」渐变近似（SVG 无 Gouraud）。
     两处实测反常识：顶点色是 COLOR16（0..65535）而非 0..255；**Alpha 恒为 0 且必须忽略**
     （按透明处理整块会消失，GDI 的 GradientFill 本就不使用 Alpha）。
     验证：RECT_V 竖采样 r 244→195→134→101、g 11→60→121→154 的平滑插值；
     RECT_H 的渐变定义满足 y1==y2。
  3) **Hatch 样式 0-5 换成 MS-WMF 权威 8×8 位图**（数据取自 Apache POI
     HwmfHatchStyle，与规范逐位一致）。修正三处确定性错误：横/竖间距由 8 改为 4、
     ForwardDiagonal 与 BackwardDiagonal 方向互换（原先反了）。其余 47 种
     （含全部百分比样式）微软从未公开像素图案，仍为参数化近似——这一点已写入文档，
     区分「权威」与「近似」两类而不是笼统标注。
  4) **未知 EMF 记录不再猜测绘制**。原先落入 `tryProcessAsCoordinates` 把记录体当
     坐标画折线（语料实测 656 次进入兜底、1 次真的画出虚假图形），比静默跳过更糟。
     改为显式登记 `EMR_SETICMMODE`/`EMR_SETCOLORSPACE`/`EMR_SETLAYOUT` 等已知可忽略
     记录，其余只记入 `drawer.unsupportedRecords`。验证：受影响文件从 753 字节降为
     253 字节，被移除的是一条坐标从 (2052,22250) 跳到 (12312,1028) 的纯垃圾路径。
  5) 门禁：每项分别更新基线并留痕——StringFormat 2 个文件、GRADIENTFILL 7 个文件、
     hatch 2 个文件、兜底 1 个文件；lint 0 error、typecheck 通过、快照 632/632、
     npm 包 3/3。
  6) 未做：EMF+ ImageAttributes（0x0800，26 次）——需要把颜色矩阵/alpha 施加到
     解码后的像素，成本高于收益且易误解析伤到现有图像，留待单独评估。

- ✅ 第八梯队（2026-10-25）：给 `scripts/diff-emf.js` 补上**取景归一化**，修正两个
  会让 RMSE 完全失真的方法论错误。
  1) 背景：本文档引用的 RMSE 依赖外部 `EMF2SVG` 转换器提供的参考 SVG。此前该脚本
     只做固定 800×600 的直接比对，实测发现这个口径几乎测不出真实差异。
  2) **错误一：固定画布比对不成立。** 本实现按 EMF 头的 `rclBounds`（内容框）缩放
     画布，而不少外部转换器按 `rclFrame`（页面框，0.01mm）排版，同一文件取景可差
     一个数量级——实测 test-007 我们的内容包围盒 776×582，参考侧只有居中的 54×28。
     直接比 800×600 得到 0.62，几乎全部来自取景。归一化（按非白包围盒裁切后拉成
     同尺寸）后该样例降到 0.22，25 个样本均值 0.2432 → 0.1494。
  3) **错误二：长宽比也必须归一化。** test-031 两边画的是同一个 3D 曲面，但我们是
     竖版、参考侧是横版，保留各自比例会把形状相同的图判成 0.72；强制拉方后降到
     0.2660，全量最差值从 0.72 收敛到 0.3379。
  4) 实现：`node scripts/diff-emf.js <目录> [输出目录] --normalize`。归一化是**可选**
     开关，默认保持原始口径以便与历史数据对照；带该参数时衡量的是形状与配色保真度，
     位置与页面尺寸约定不参与。
  5) 基线（186 个 emf-valid，`--normalize`）：**平均 RMSE 0.1574，中位 0.1552**，
     >0.30 仅 3 个（test-178 / test-025 / test-104），下一步优先排查这三个。
  6) 必须记住的局限：外部参考实现自身的 EMF+ 支持并不完整（hatch 用纯色近似、
     裁剪与渐变多处 TODO），因此 RMSE 衡量的是**差异**而非**正确性**。要判断正确性
     仍需 Windows GDI 真值——元文件每条记录头里的 `rclBounds` 记录的正是 Windows
     播放该记录时的输出包围盒，可作为免外部参考的逐记录真值。
