// GDI 对象管理模块
class GdiObjectManager {
    constructor() {
        this.gdiObjects = new Map(); // GDI对象表
        this.objectHandles = []; // 对象句柄列表
        this.nextHandle = 0; // 下一个可用的句柄
    }

    createPen(style, width, color) {
        this.nextHandle++;
        this.objectHandles.push(this.nextHandle);

        const penObj = {
            type: 'pen',
            style,
            width,
            color
        };
        this.gdiObjects.set(this.nextHandle, penObj);
        return this.nextHandle;
    }

    createBrush(style, color) {
        this.nextHandle++;
        this.objectHandles.push(this.nextHandle);

        const brushObj = {
            type: 'brush',
            style,
            color
        };
        this.gdiObjects.set(this.nextHandle, brushObj);
        return this.nextHandle;
    }

    selectObject(handle) {
        return this.gdiObjects.get(handle);
    }

    deleteObject(handle) {
        this.gdiObjects.delete(handle);
        const index = this.objectHandles.indexOf(handle);
        if (index > -1) {
            this.objectHandles.splice(index, 1);
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
        this.gdiObjects.clear();
        this.objectHandles = [];
        this.nextHandle = 0;
    }
}

module.exports = GdiObjectManager;