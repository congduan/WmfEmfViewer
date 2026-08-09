// MathType MTEF parser - 提取字符流
// 基于 Wiris MTEF 格式（参考 mtef-go 实现与 MathType 5/6 实际样本）：
// - Header: version(1) + platform(1) + product(1) + productVersion(1) +
//   productSubVersion(1) + applicationKey(null 结尾) + inline(1)
// - 对象列表由单字节 RecordType + 各自 options/字段组成，END(0) 结束子列表
// 目标：从 MTEF 中提取每个 CHAR 的显示字符与字体类别，供 WMF 文本替换使用。

// 记录类型
const MTEF_END = 0;
const MTEF_LINE = 1;
const MTEF_CHAR = 2;
const MTEF_TMPL = 3;
const MTEF_PILE = 4;
const MTEF_MATRIX = 5;
const MTEF_EMBELL = 6;
const MTEF_RULER = 7;
const MTEF_FONT_STYLE_DEF = 8;
const MTEF_SIZE = 9;
const MTEF_FULL = 10;
const MTEF_SUB = 11;
const MTEF_SUB2 = 12;
const MTEF_SYM = 13;
const MTEF_SUBSYM = 14;
const MTEF_COLOR = 15;
const MTEF_COLOR_DEF = 16;
const MTEF_FONT_DEF = 17;
const MTEF_EQN_PREFS = 18;
const MTEF_ENCODING_DEF = 19;

// CHAR options
const OPT_NUDGE = 0x08;
const OPT_CHAR_ENC_CHAR8 = 0x04;
const OPT_CHAR_ENC_CHAR16 = 0x10;
const OPT_CHAR_ENC_NO_MTCODE = 0x20;

// LINE options
const OPT_LINE_NULL = 0x01;
const OPT_LP_RULER = 0x02;
const OPT_LINE_LSPACE = 0x04;

// 字体类别（CHAR 的 typeface 字段取值）
const FN_TEXT = 1;
const FN_FUNCTION = 2;
const FN_VARIABLE = 3;
const FN_LCGREEK = 4;
const FN_UCGREEK = 5;
const FN_SYMBOL = 6;
const FN_VECTOR = 7;
const FN_NUMBER = 8;
const FN_USER1 = 9;
const FN_USER2 = 10;
const FN_MTEXTRA = 11;

class MathTypeMtefParser {
  constructor(data) {
    this.data = new Uint8Array(data);
    this.offset = 0;
    this.charStream = []; // { char, fontKind }
  }

  parse() {
    if (this.data.length === 0) {
      return { chars: [] };
    }

    try {
      // Header
      this.readByte(); // version
      this.readByte(); // platform
      this.readByte(); // product
      this.readByte(); // productVersion
      this.readByte(); // productSubVersion
      this.readNullTerminatedString(); // applicationKey（如 "DSMT6"）
      this.readByte(); // inline

      this.parseObjectList();
    } catch (error) {
      // 解析失败时返回已提取的字符
    }

    return { chars: this.charStream };
  }

  parseObjectList() {
    while (this.offset < this.data.length) {
      const type = this.readByte();
      switch (type) {
        case MTEF_END:
          return; // 子对象列表结束
        case MTEF_LINE: {
          const options = this.readByte();
          this.skipNudgeIfNeeded(options);
          if (options & OPT_LINE_LSPACE) this.readByte();
          if (options & OPT_LP_RULER) this.parseRuler();
          if (!(options & OPT_LINE_NULL)) this.parseObjectList();
          break;
        }
        case MTEF_CHAR:
          this.parseChar();
          break;
        case MTEF_TMPL: {
          const options = this.readByte();
          this.skipNudgeIfNeeded(options);
          this.readByte(); // selector
          this.readVariation(); // variation（1 或 2 字节）
          this.readByte(); // options
          this.parseObjectList();
          break;
        }
        case MTEF_PILE: {
          const options = this.readByte();
          this.skipNudgeIfNeeded(options);
          this.readByte(); // halign
          this.readByte(); // valign
          if (options & OPT_LP_RULER) this.parseRuler();
          this.parseObjectList();
          break;
        }
        case MTEF_MATRIX: {
          const options = this.readByte();
          this.skipNudgeIfNeeded(options);
          this.readByte(); // valign
          this.readByte(); // h_just
          this.readByte(); // v_just
          this.readByte(); // rows
          this.readByte(); // cols
          this.parseObjectList();
          break;
        }
        case MTEF_EMBELL: {
          const options = this.readByte();
          this.skipNudgeIfNeeded(options);
          this.readByte(); // embellishment type
          break;
        }
        case MTEF_RULER:
          this.parseRuler();
          break;
        case MTEF_FONT_STYLE_DEF:
        case MTEF_FONT_DEF:
          this.readByte(); // index
          this.readNullTerminatedString(); // name
          break;
        case MTEF_SIZE:
          this.readByte();
          this.readByte();
          break;
        case MTEF_FULL:
        case MTEF_SUB:
        case MTEF_SUB2:
        case MTEF_SYM:
        case MTEF_SUBSYM:
          break;
        case MTEF_COLOR:
          this.readByte();
          break;
        case MTEF_COLOR_DEF: {
          const options = this.readByte();
          const n = options & 0x01 ? 4 : 3; // CMYK 或 RGB
          for (let i = 0; i < n; i++) this.readByte();
          if (options & 0x04) this.readNullTerminatedString();
          break;
        }
        case MTEF_EQN_PREFS:
          this.skipEqnPrefs();
          break;
        case MTEF_ENCODING_DEF:
          this.readNullTerminatedString();
          break;
        default:
          if (type >= 100) {
            // FUTURE record：后跟 1 字节长度，跳过该长度数据
            this.skipBytes(this.readByte());
          } else {
            // 未知记录类型，停止解析避免失步
            return;
          }
      }
    }
  }

  parseChar() {
    const options = this.readByte();
    this.skipNudgeIfNeeded(options);
    const typeface = this.readByte();

    let charValue = 0;
    if (!(options & OPT_CHAR_ENC_NO_MTCODE)) {
      charValue = this.readByte(); // MTCode（1 字节）
    }
    if (options & OPT_CHAR_ENC_CHAR8) {
      charValue = this.readByte(); // 8 位字体位置
    }
    if (options & OPT_CHAR_ENC_CHAR16) {
      charValue = this.readWord(); // 16 位字体位置
    }

    let fontKind = 'text';
    if (typeface === FN_SYMBOL || typeface === FN_LCGREEK || typeface === FN_UCGREEK) {
      fontKind = 'symbol';
    } else if (typeface === FN_MTEXTRA) {
      fontKind = 'mtextra';
    }

    this.charStream.push({ char: String.fromCharCode(charValue & 0xFF), fontKind });
  }

  // variation：首字节高位为 1 时占 2 字节
  readVariation() {
    const b = this.readByte();
    if (b & 0x80) {
      this.readByte();
    }
  }

  skipNudgeIfNeeded(options) {
    if (!(options & OPT_NUDGE)) return;
    const dx = this.readByte();
    const dy = this.readByte();
    if (dx === 0x80 || dy === 0x80) {
      this.readWord();
      this.readWord();
    }
  }

  parseRuler() {
    const nStops = this.readByte();
    for (let i = 0; i < nStops; i++) {
      this.readByte(); // tab stop type
      this.readWord(); // offset
    }
  }

  // 跳过 EQN_PREFS（mtef-go readEqnPrefs）：
  // options + sizes(count + dimension array) + spaces(count + dimension array) + styles(count)
  skipEqnPrefs() {
    this.readByte(); // options
    const sizes = this.readByte();
    this.readDimensionArray(sizes);
    const spaces = this.readByte();
    this.readDimensionArray(spaces);
    const styles = this.readByte();
    for (let i = 0; i < styles; i++) {
      const c = this.readByte();
      if (c !== 0) this.readByte(); // 非 0 时该项占 2 字节
    }
  }

  // 维度数组：以 nibble 0x0F 作为数组项结束标记，直到 count 项
  readDimensionArray(count) {
    let items = 0;
    while (items < count) {
      const ch = this.readByte();
      if ((ch & 0x0F) === 0x0F) items++;
      if ((ch & 0xF0) === 0xF0) items++;
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
