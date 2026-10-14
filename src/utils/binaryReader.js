// Little-endian reading primitives shared by all three drawers.
//
// Semantics (bit-for-bit identical to the implementations previously inlined in
// WmfDrawer / EmfDrawer / EmfPlusDrawer):
//   - out-of-range reads return 0 instead of throwing; callers do their own
//     record-length validation;
//   - readDword / readLong return *signed* 32-bit values (historical behaviour);
//     apply `>>> 0` at the call site when an unsigned value is required;
//   - readFloat32 decodes IEEE-754 single precision with integer bit
//     operations, matching both the previous hand-written EmfDrawer version and
//     the EmfPlusDrawer DataView version.

/**
 * Read a little-endian WORD (unsigned 16-bit).
 * @param {Uint8Array} data
 * @param {number} offset
 * @returns {number}
 */
function readWord(data, offset) {
    if (offset + 2 > data.length) return 0;
    return data[offset] | (data[offset + 1] << 8);
}

/**
 * Read a little-endian SHORT (signed 16-bit).
 * @param {Uint8Array} data
 * @param {number} offset
 * @returns {number}
 */
function readShort(data, offset) {
    const value = readWord(data, offset);
    return (value & 0x8000) ? value - 0x10000 : value;
}

/**
 * Read a little-endian DWORD (signed 32-bit, see file header).
 * @param {Uint8Array} data
 * @param {number} offset
 * @returns {number}
 */
function readDword(data, offset) {
    if (offset + 4 > data.length) return 0;
    return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
}

/**
 * Read a little-endian LONG (signed 32-bit).
 * @param {Uint8Array} data
 * @param {number} offset
 * @returns {number}
 */
function readLong(data, offset) {
    const value = readDword(data, offset);
    return value > 0x7FFFFFFF ? value - 0x100000000 : value;
}

/**
 * Read a little-endian float32.
 * @param {Uint8Array} data
 * @param {number} offset
 * @returns {number}
 */
function readFloat32(data, offset) {
    if (offset + 4 > data.length) return 0;
    const v = (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
    const sign = (v & 0x80000000) ? -1 : 1;
    const exp = (v >>> 23) & 0xFF;
    const frac = v & 0x7FFFFF;
    if (exp === 255) return frac ? NaN : sign * Infinity;
    if (exp === 0) return frac === 0 ? sign * 0 : sign * frac * Math.pow(2, -149);
    return sign * (1 + frac / 0x800000) * Math.pow(2, exp - 127);
}

/**
 * Read a fixed-length single-byte string, skipping NUL bytes
 * (ASCII fields inside WMF records).
 * @param {Uint8Array} data
 * @param {number} offset
 * @param {number} length
 * @returns {string}
 */
function readString(data, offset, length) {
    let str = '';
    for (let i = 0; i < length && offset + i < data.length; i++) {
        if (data[offset + i] !== 0) {
            str += String.fromCharCode(data[offset + i]);
        }
    }
    return str;
}

module.exports = {
    readWord,
    readShort,
    readDword,
    readLong,
    readFloat32,
    readString
};
