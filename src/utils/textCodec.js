// Text decoding helpers shared by all three drawers.
//
// Metafile strings come from three different sources with different semantics,
// so this module keeps **explicit switches** instead of normalising everything
// into one strategy (normalising would change current rendering output):
//   1. Single-byte fields inside WMF records: local code page (DBCS needs the
//      CharSet), and ASCII-only fields such as font names accept printable
//      ASCII only;
//   2. EMF "A" records: ANSI strings whose bytes >= 0x80 depend on the font
//      charset and cannot be recovered reliably from the metafile, so they are
//      degraded to a space;
//   3. EMF "W" records / EMF+ strings: UTF-16LE, but implementations disagree
//      on NUL handling: EMR_EXTTEXTOUTW skips NUL and continues,
//      EMR_SMALLTEXTOUT keeps it, while EmfPlusDrawString and FaceName stop at it.

// DBCS CharSet -> TextDecoder encoding label (null when not DBCS).
// CharSet values per MS-WMF 2.1.1.5 LOGFONTW.CharSet.
const DBCS_CHARSET_LABELS = {
    128: 'shift_jis', // SHIFTJIS_CHARSET
    129: 'euc-kr',    // HANGUL_CHARSET
    134: 'gbk',       // GB2312_CHARSET
    136: 'big5'       // CHINESEBIG5_CHARSET
};

/**
 * CharSet -> TextDecoder encoding label.
 * @param {number} charset
 * @returns {string|null}
 */
function dbcsLabelForCharset(charset) {
    return DBCS_CHARSET_LABELS[charset] || null;
}

/**
 * Decode local code page bytes with the given label; returns '' when the label
 * is unsupported or decoding fails.
 * @param {number[]|Uint8Array} bytes
 * @param {string} charsetLabel
 * @returns {string}
 */
function decodeLocalBytes(bytes, charsetLabel) {
    try {
        return new TextDecoder(charsetLabel).decode(Uint8Array.from(bytes));
    } catch (e) {
        return '';
    }
}

/**
 * Keep printable ASCII only (0x20-0x7E), for ASCII fields such as font names.
 * @param {number[]|Uint8Array} bytes
 * @returns {string}
 */
function printableAscii(bytes) {
    let out = '';
    for (const b of bytes) {
        if (b >= 32 && b <= 126) out += String.fromCharCode(b);
    }
    return out;
}

/**
 * Merge DBCS text runs and decode them afterwards.
 * GDI marks the trailing byte of a double-byte character with a Dx entry of 0,
 * so bytes whose Dx is 0 belong to the byte sequence of the previous character.
 * @param {Uint8Array} rawBytes raw string bytes
 * @param {number[]} dxList Dx array, same length as rawBytes
 * @param {string} charsetLabel
 * @returns {{chars: string[], charDx: number[], text: string}|null} null on failure or empty result
 */
function mergeDbcsRuns(rawBytes, dxList, charsetLabel) {
    try {
        const decoder = new TextDecoder(charsetLabel);
        const runs = [];
        for (let i = 0; i < rawBytes.length; i++) {
            if (dxList[i] === 0 && runs.length > 0) {
                runs[runs.length - 1].bytes.push(rawBytes[i]);
            } else {
                runs.push({ bytes: [rawBytes[i]], dx: dxList[i] });
            }
        }
        const chars = runs.map(r => decoder.decode(Uint8Array.from(r.bytes)));
        if (!chars.join('')) return null;
        return { chars, charDx: runs.map(r => r.dx), text: chars.join('') };
    } catch (e) {
        return null;
    }
}

/**
 * Decode a UTF-16LE string.
 * @param {Uint8Array} data
 * @param {number} offset start byte offset
 * @param {number} charCount number of code units
 * @param {{skipNul?: boolean, breakAtNul?: boolean}} [options]
 *        skipNul: skip NUL code units and continue (EMR_EXTTEXTOUTW)
 *        breakAtNul: stop at the first NUL (EmfPlusDrawString, FaceName)
 *        when both are false the NUL is preserved (EMR_SMALLTEXTOUT)
 * @returns {string}
 */
function decodeUtf16Le(data, offset, charCount, options = {}) {
    const skipNul = options.skipNul === true;
    const breakAtNul = options.breakAtNul === true;
    let text = '';
    for (let i = 0; i < charCount; i++) {
        const code = data[offset + i * 2] | (data[offset + i * 2 + 1] << 8);
        if (code === 0) {
            if (breakAtNul) break;
            if (skipNul) continue;
        }
        text += String.fromCharCode(code);
    }
    return text;
}

/**
 * Read a NUL-terminated UTF-16LE name (LOGFONTW.FaceName, EmfPlusFont.FaceName).
 * @param {Uint8Array} data
 * @param {number} offset start byte offset
 * @param {number} maxChars maximum number of characters to read
 * @returns {string}
 */
function readUtf16Name(data, offset, maxChars) {
    return decodeUtf16Le(data, offset, maxChars, { breakAtNul: true });
}

/**
 * Byte-for-byte decoding (one byte per code unit).
 * Used by the single-byte character mode of EMR_SMALLTEXTOUT: GDI hands the
 * 8-bit characters to the font as character codes, so there is no ">= 0x80"
 * degradation here.
 * @param {Uint8Array} data
 * @param {number} offset
 * @param {number} length
 * @returns {string}
 */
function decodeSingleBytes(data, offset, length) {
    let text = '';
    for (let i = 0; i < length; i++) {
        text += String.fromCharCode(data[offset + i]);
    }
    return text;
}

/**
 * Decode an ANSI string ("A" records): bytes >= 0x80 depend on the font charset
 * and cannot be recovered reliably from the metafile, so they degrade to a space.
 * @param {Uint8Array} data
 * @param {number} offset
 * @param {number} length
 * @returns {string}
 */
function decodeAnsiBytes(data, offset, length) {
    let text = '';
    for (let i = 0; i < length; i++) {
        const b = data[offset + i];
        text += b >= 0x80 ? ' ' : String.fromCharCode(b);
    }
    return text;
}

module.exports = {
    dbcsLabelForCharset,
    decodeLocalBytes,
    printableAscii,
    mergeDbcsRuns,
    decodeUtf16Le,
    readUtf16Name,
    decodeSingleBytes,
    decodeAnsiBytes
};
