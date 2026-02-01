// GDI 对象管理模块
class GdiObjectManager {
    constructor() {
        // WMF对象句柄是0基索引，使用对象表来管理
        this.objectTable = [];
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

    createObject(obj) {
        const index = this.objectTable.findIndex(item => item == null);
        if (index === -1) {
            this.objectTable.push(obj);
            return this.objectTable.length - 1;
        }
        this.objectTable[index] = obj;
        return index;
    }

    selectObject(handle) {
        return this.objectTable[handle];
    }

    deleteObject(handle) {
        if (handle >= 0 && handle < this.objectTable.length) {
            this.objectTable[handle] = null;
        }
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
        this.objectTable = [];
    }
}

module.exports = GdiObjectManager;