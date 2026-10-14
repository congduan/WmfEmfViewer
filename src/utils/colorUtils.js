// Color conversion helpers shared by all three drawers.
//
// Semantics (identical to the implementations previously inlined in each drawer):
//   - colorRefToHex: COLORREF (0x00bbggrr) -> '#rrggbb'
//   - argbToCss: 32-bit ARGB -> '#rrggbb' when a === 0xFF,
//     otherwise 'rgba(r, g, b, x.xxx)'

/**
 * COLORREF (0x00bbggrr) -> '#rrggbb'.
 * @param {number} rgb
 * @returns {string}
 */
function colorRefToHex(rgb) {
    const r = (rgb & 0xFF).toString(16).padStart(2, '0');
    const g = ((rgb >> 8) & 0xFF).toString(16).padStart(2, '0');
    const b = ((rgb >> 16) & 0xFF).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

/**
 * 32-bit ARGB -> CSS color (alpha-aware).
 * @param {number} argb
 * @returns {string}
 */
function argbToCss(argb) {
    const a = (argb >>> 24) & 0xFF;
    const r = (argb >>> 16) & 0xFF;
    const g = (argb >>> 8) & 0xFF;
    const b = argb & 0xFF;
    if (a === 0xFF) {
        return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
    }
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/**
 * Read a 32-bit ARGB value (returns 0xFFFFFFFF when out of range).
 * @param {Uint8Array} data
 * @param {number} offset
 * @returns {number}
 */
function readArgb(data, offset) {
    if (offset + 4 > data.length) return 0xFFFFFFFF;
    return (data[offset] & 0xFF) |
        ((data[offset + 1] & 0xFF) << 8) |
        ((data[offset + 2] & 0xFF) << 16) |
        ((data[offset + 3] & 0xFF) << 24);
}

module.exports = {
    colorRefToHex,
    argbToCss,
    readArgb
};
