// MathType MTEF parser (partial) for extracting character stream
// Based on MathType MTEF v2+ format (Wiris documentation)
class MathTypeMtefParser {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.offset = 0;
        this.fontMap = new Map(); // explicit font id -> name
        this.charStream = []; // { char, fontKind }
    }

    parse() {
        if (this.data.length === 0) {
            return { chars: [] };
        }

        // MTEF header
        const version = this.readByte();
        if (version >= 2 && this.data.length >= 5) {
            // version, platform, product, productVersion, productSubversion
            this.readByte();
            this.readByte();
            this.readByte();
            this.readByte();
        }

        try {
            this.parseObjectList();
        } catch (error) {
            // If parsing fails, return what we have
        }

        return { chars: this.charStream };
    }

    parseObjectList() {
        while (this.offset < this.data.length) {
            const tag = this.readByte();
            const type = tag & 0x0F;
            const flags = (tag & 0xF0) >> 4;

            if (type === 0) {
                return; // END record
            }

            switch (type) {
                case 1: // LINE
                    this.skipNudgeIfNeeded(flags);
                    if (flags & 0x4) {
                        this.readWord(); // line spacing
                    }
                    if (flags & 0x2) {
                        this.parseRuler();
                    }
                    if (!(flags & 0x1)) {
                        this.parseObjectList();
                    }
                    break;
                case 2: // CHAR
                    this.skipNudgeIfNeeded(flags);
                    this.parseChar(flags);
                    break;
                case 3: // TMPL
                    this.skipNudgeIfNeeded(flags);
                    this.readByte(); // selector
                    this.readByte(); // variation
                    this.readByte(); // options
                    this.parseObjectList();
                    break;
                case 4: // PILE
                    this.skipNudgeIfNeeded(flags);
                    this.readByte(); // halign
                    this.readByte(); // valign
                    if (flags & 0x2) {
                        this.parseRuler();
                    }
                    this.parseObjectList();
                    break;
                case 5: // MATRIX
                    this.skipNudgeIfNeeded(flags);
                    this.readByte(); // valign
                    this.readByte(); // h_just
                    this.readByte(); // v_just
                    const rows = this.readByte();
                    const cols = this.readByte();
                    const rowParts = Math.ceil((rows + 1) / 4);
                    const colParts = Math.ceil((cols + 1) / 4);
                    this.skipBytes(rowParts + colParts);
                    this.parseObjectList();
                    break;
                case 6: // EMBELL
                    this.skipNudgeIfNeeded(flags);
                    this.readByte(); // embellishment type
                    break;
                case 7: // RULER
                    this.parseRuler();
                    break;
                case 8: // FONT
                    this.parseFont();
                    break;
                case 9: // SIZE
                    this.parseSize();
                    break;
                case 10: // FULL
                case 11: // SUB
                case 12: // SUB2
                case 13: // SYM
                case 14: // SUBSYM
                    // no payload
                    break;
                default:
                    // Unknown record type; bail out to avoid desync
                    return;
            }
        }
    }

    parseChar(flags) {
        const typefaceRaw = this.readByte();
        const typeface = typefaceRaw - 128;
        const charValue = this.readWord();

        let fontKind = 'text';
        if (typeface > 0) {
            if (typeface === 6) {
                fontKind = 'symbol';
            } else if (typeface === 11) {
                fontKind = 'mtextra';
            }
        } else if (typeface < 0) {
            const fontId = -typeface;
            const fontName = (this.fontMap.get(fontId) || '').toLowerCase();
            if (fontName.includes('symbol')) {
                fontKind = 'symbol';
            } else if (fontName.includes('mt extra')) {
                fontKind = 'mtextra';
            }
        }

        let char;
        if (fontKind === 'text') {
            char = String.fromCharCode(charValue);
        } else {
            // For symbolic fonts, charValue is a font index (0-255)
            char = String.fromCharCode(charValue & 0xFF);
        }

        this.charStream.push({ char, fontKind });

        if (flags & 0x2) {
            // embellishment list (object list)
            this.parseObjectList();
        }
    }

    parseFont() {
        const typefaceNum = this.readByte();
        this.readByte(); // style
        const name = this.readNullTerminatedString();
        if (typefaceNum > 0) {
            this.fontMap.set(typefaceNum, name);
        }
    }

    parseSize() {
        const b = this.readByte();
        if (b === 101) {
            this.readWord(); // explicit size
        } else if (b === 100) {
            this.readByte(); // lsize
            this.readWord(); // dsize
        } else {
            this.readByte(); // dsize
        }
    }

    parseRuler() {
        const nStops = this.readByte();
        for (let i = 0; i < nStops; i++) {
            this.readByte(); // tab stop type
            this.readWord(); // offset
        }
    }

    skipNudgeIfNeeded(flags) {
        if (!(flags & 0x8)) return;
        const dx = this.readByte();
        const dy = this.readByte();
        if (dx === 0x80 && dy === 0x80) {
            this.readWord();
            this.readWord();
        }
    }

    readByte() {
        if (this.offset >= this.data.length) return 0;
        return this.data[this.offset++];
    }

    readWord() {
        if (this.offset + 1 >= this.data.length) {
            this.offset = this.data.length;
            return 0;
        }
        const value = this.data[this.offset] | (this.data[this.offset + 1] << 8);
        this.offset += 2;
        return value;
    }

    readNullTerminatedString() {
        let out = '';
        while (this.offset < this.data.length) {
            const b = this.data[this.offset++];
            if (b === 0) break;
            if (b >= 32 && b <= 126) {
                out += String.fromCharCode(b);
            }
        }
        return out;
    }

    skipBytes(count) {
        this.offset = Math.min(this.data.length, this.offset + count);
    }
}

module.exports = MathTypeMtefParser;
