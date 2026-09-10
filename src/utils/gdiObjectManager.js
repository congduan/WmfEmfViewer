// GDI 对象管理模块
// 内部用 Map 按"句柄"存取对象。
// - WMF：句柄即创建顺序索引，create* 自动分配最小未占用句柄；
// - EMF：句柄由生产者任意分配（[MS-EMF] 2.2.8 ObjectHandle），
//   必须用 createObjectAt(handle, obj) 按文件声明的句柄存储。
class GdiObjectManager {
    constructor() {
        /** @type {Map<number, object>} 句柄 -> GDI 对象 */
        this.objectTable = new Map();
    }

    createPen(style, width, color) {
        return this.createObject({
            type: 'pen',
            style,
            width,
            color
        });
    }

    createBrush(style, color) {
        return this.createObject({
            type: 'brush',
            style,
            color
        });
    }

    createFont(height, width, weight, italic, underline, strikeOut, faceName, charset = 0) {
        return this.createObject({
            type: 'font',
            height,
            width,
            weight,
            italic,
            underline,
            strikeOut,
            faceName,
            charset
        });
    }

    createObject(obj) {
        // 自动分配：找最小未占用句柄（与旧数组"首个空位"语义一致，WMF 用）
        let handle = 0;
        while (this.objectTable.has(handle)) handle++;
        this.objectTable.set(handle, obj);
        return handle;
    }

    // 按文件声明的句柄存储（EMF 用）
    createObjectAt(handle, obj) {
        this.objectTable.set(handle, obj);
        return handle;
    }

    selectObject(handle) {
        const obj = this.objectTable.get(handle);
        if (obj) {
            // 记录当前各类型对象，便于 processEmfTextOut 等查询（避免全文扫表）
            if (obj.type === 'font') this._currentFont = obj;
            else if (obj.type === 'pen') this._currentPen = obj;
            else if (obj.type === 'brush') this._currentBrush = obj;
        }
        return obj;
    }

    /** 当前选中的字体对象（processEmfTextOut 用于读取 lfEscapement/lfOrientation 做文字旋转） */
    get currentFont() { return this._currentFont; }

    deleteObject(handle) {
        this.objectTable.delete(handle);
    }

    getStockObject(stockIndex) {
        const stockColors = {
            0x80000005: '#ffffff', // NULL_BRUSH
            0x80000004: '#000000', // BLACK_BRUSH
            0x80000003: '#808080', // DKGRAY_BRUSH
            0x80000002: '#c0c0c0', // LTGRAY_BRUSH
            0x80000001: '#ffffff', // WHITE_BRUSH
            0x80000007: '#000000', // BLACK_PEN
            0x80000006: '#ffffff', // WHITE_PEN
            0x80000008: 'transparent'  // NULL_PEN
        };

        return stockColors[stockIndex];
    }

    clear() {
        this.objectTable.clear();
    }
}

module.exports = GdiObjectManager;
