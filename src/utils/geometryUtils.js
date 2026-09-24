// 椭圆 / 弧几何工具。
//
// 抽取动机：WMF 与 EMF 绘制器各自实现了一份**逐字相同**的椭圆参数与弧起止角计算，
// EMF 侧还把「弧 / 弦 / 饼」写成了三个几乎相同的方法（WMF 早已用 kind 参数合并）。
//
// 重要约定：本模块**不**擅自规范化输入（例如半径不取绝对值、不补零值守卫）。
// 三个绘制器对「反向包围盒」的处理并不一致，而渲染结果需与参考实现（libemf2svg）
// 保持 RMSE 对齐，因此取绝对值等语义一律由调用方显式选择。

/**
 * 由矩形两角点求椭圆参数。半轴为有符号值（与原始表达式一致，不取绝对值）。
 * @param {{x:number, y:number}} c1 角点
 * @param {{x:number, y:number}} c2 对角点
 * @returns {{cx:number, cy:number, rx:number, ry:number}}
 */
function ellipseFromCorners(c1, c2) {
  return {
    cx: (c1.x + c2.x) / 2,
    cy: (c1.y + c2.y) / 2,
    rx: (c2.x - c1.x) / 2,
    ry: (c2.y - c1.y) / 2
  };
}

/**
 * 同 {@link ellipseFromCorners}，但半轴取绝对值（多数调用点的语义）。
 * @param {{x:number, y:number}} c1
 * @param {{x:number, y:number}} c2
 * @returns {{cx:number, cy:number, rx:number, ry:number}}
 */
function absEllipseFromCorners(c1, c2) {
  const e = ellipseFromCorners(c1, c2);
  e.rx = Math.abs(e.rx);
  e.ry = Math.abs(e.ry);
  return e;
}

/**
 * 计算椭圆弧的起止角（画布坐标系）。
 * @param {number} cx 椭圆心 x
 * @param {number} cy 椭圆心 y
 * @param {number} rx 横半轴
 * @param {number} ry 纵半轴
 * @param {{x:number, y:number}} start 已变换到画布坐标的弧起点
 * @param {{x:number, y:number}} end 已变换到画布坐标的弧终点
 * @param {boolean} anticlockwise 画布是否按逆时针扫过
 * @returns {{startAngle:number, endAngle:number, anticlockwise:boolean}}
 */
function arcAngles(cx, cy, rx, ry, start, end, anticlockwise) {
  return {
    startAngle: Math.atan2((start.y - cy) / ry, (start.x - cx) / rx),
    endAngle: Math.atan2((end.y - cy) / ry, (end.x - cx) / rx),
    anticlockwise
  };
}

/**
 * 椭圆弧 / 弦 / 饼的统一路径与描边规则：
 * - `'Arc'`：仅描边
 * - `'Chord'`：弦，闭合起止点后「填充 + 描边」
 * - `'Pie'`：饼，先连圆心，闭合后「填充 + 描边」
 * 起止角重合时按整圆绘制（不做整圆判断会导致零长度弧被丢弃）。
 * @param {object} ctx Canvas2D 兼容上下文
 * @param {'Arc'|'Chord'|'Pie'} kind
 * @param {{cx:number, cy:number, rx:number, ry:number}} ellipse
 * @param {{startAngle:number, endAngle:number, anticlockwise:boolean}} angles
 * @returns {boolean} 是否为整圆
 */
function drawArcLike(ctx, kind, ellipse, angles) {
  const { cx, cy, rx, ry } = ellipse;
  const full = Math.abs(angles.endAngle - angles.startAngle) < 1e-6;

  ctx.beginPath();
  if (kind === 'Pie') {
    ctx.moveTo(cx, cy);
  }
  if (full) {
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(cx, cy, rx, ry, 0, angles.startAngle, angles.endAngle, angles.anticlockwise);
  }
  if (kind === 'Chord' || kind === 'Pie') {
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.stroke();
  }
  return full;
}

module.exports = {
  ellipseFromCorners,
  absEllipseFromCorners,
  arcAngles,
  drawArcLike
};
