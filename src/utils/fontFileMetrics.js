// 零依赖系统字体度量（Node 专用）。
//
// 目标：让 SVG / PDF / WMF 文本推进拿到**真实字形宽度**，而不是
// `0.6 × 字号 × 字符数` 的估算。做法是直接解析系统字体文件的
// head / hhea / maxp / hmtx / cmap / name 表——只读度量，不碰轮廓，
// 因此 TTF / TTC / OTF(CFF) 都能用，也不需要任何 native 依赖。
//
// 用法（Node 侧）：
//   const { createMeasureProvider } = require('./fontFileMetrics');
//   SvgContext.setMeasureProvider(createMeasureProvider());
//
// 注意：
//   - 本模块依赖 fs/os/path，**不能**进入浏览器 bundle。浏览器侧请依赖
//     src/utils/textMetrics 的宿主 canvas 自动度量。
//   - 任何异常都退化为「返回 null」，让调用方回退到估算；不做抛错式失败。
//   - 字体度量与 hinting 无关：advance width 是字体设计值，与 Windows
//     光栅化无关，因此这里的结果可以跨平台复现。
const fs = require('fs');
const os = require('os');
const path = require('path');

const FONT_EXTENSIONS = new Set(['.ttf', '.ttc', '.otf', '.otc']);
const MAX_WALK_DEPTH = 4;

// Windows 常见字体名 → 其他平台上的等价字体（按优先级）
const FAMILY_ALIASES = {
    'arial': ['Arial', 'Helvetica', 'Liberation Sans', 'DejaVu Sans'],
    'helvetica': ['Helvetica', 'Arial', 'Liberation Sans'],
    'helvetica neue': ['Helvetica Neue', 'Helvetica', 'Arial'],
    'times new roman': ['Times New Roman', 'Times', 'Liberation Serif', 'DejaVu Serif'],
    'times': ['Times', 'Times New Roman', 'Liberation Serif'],
    'courier new': ['Courier New', 'Courier', 'Liberation Mono', 'DejaVu Sans Mono'],
    'courier': ['Courier', 'Courier New', 'Liberation Mono'],
    'segoe ui': ['Segoe UI', 'Helvetica Neue', 'Arial', 'DejaVu Sans'],
    'tahoma': ['Tahoma', 'Verdana', 'DejaVu Sans'],
    'verdana': ['Verdana', 'DejaVu Sans'],
    'calibri': ['Calibri', 'Carlito', 'Helvetica Neue', 'Arial'],
    'cambria': ['Cambria', 'Caladea', 'Times New Roman'],
    'ms sans serif': ['MS Sans Serif', 'Arial', 'Helvetica'],
    'microsoft sans serif': ['Microsoft Sans Serif', 'Arial', 'Helvetica'],
    'small fonts': ['Small Fonts', 'Arial'],
    'system': ['System', 'Arial'],
    // 日文 Windows 字体：macOS/Linux 上对应的等价字体
    'ms gothic': ['MS Gothic', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'PingFang SC', 'Noto Sans CJK SC'],
    'ms pgothic': ['MS PGothic', 'Hiragino Sans', 'PingFang SC'],
    'ms mincho': ['MS Mincho', 'Hiragino Mincho ProN', 'Songti SC', 'Noto Serif CJK SC'],
    'ms pmincho': ['MS PMincho', 'Hiragino Mincho ProN', 'Songti SC'],
    'ms ui gothic': ['MS UI Gothic', 'Hiragino Sans', 'PingFang SC'],
    'sans-serif': ['Helvetica Neue', 'Arial', 'DejaVu Sans'],
    'serif': ['Times New Roman', 'Times', 'DejaVu Serif'],
    'monospace': ['Courier New', 'Courier', 'DejaVu Sans Mono'],
};

/** @type {Map<string, Array<any>>|null} */
let familyIndex = null;
/** @type {Map<string, any>} */
const faceCache = new Map();
/** @type {Array<string>|null} */
let searchDirsCache = null;

/** 系统字体搜索目录 @returns {Array<string>} */
function fontSearchDirs() {
    if (searchDirsCache) return searchDirsCache;
    const home = os.homedir();
    const byPlatform = {
        darwin: [
            '/System/Library/Fonts',
            '/System/Library/Fonts/Supplemental',
            '/Library/Fonts',
            path.join(home, 'Library/Fonts'),
        ],
        win32: [
            path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'),
            path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts'),
        ],
        linux: [
            '/usr/share/fonts',
            '/usr/local/share/fonts',
            path.join(home, '.fonts'),
            path.join(home, '.local/share/fonts'),
        ],
    };
    searchDirsCache = (byPlatform[process.platform] || byPlatform.linux).filter(Boolean);
    return searchDirsCache || [];
}

/**
 * @param {string} dir
 * @param {number} depth
 * @param {Array<string>} out
 */
function walkFontFiles(dir, depth, out) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
        return;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (depth < MAX_WALK_DEPTH) walkFontFiles(full, depth + 1, out);
        } else if (FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            out.push(full);
        }
    }
}

// ---- 二进制读取 ----
/** @param {Buffer} buf @param {number} offset */
function u16(buf, offset) { return buf.readUInt16BE(offset); }
/** @param {Buffer} buf @param {number} offset */
function i16(buf, offset) { return buf.readInt16BE(offset); }
/** @param {Buffer} buf @param {number} offset */
function u32(buf, offset) { return buf.readUInt32BE(offset); }

/**
 * 读取 sfnt 表目录（TTF/OTF；TTC 需先定位子字体偏移）
 * @param {Buffer} buf
 * @param {number} base
 * @returns {Record<string, {offset:number, length:number}>}
 */
function readTables(buf, base) {
    /** @type {Record<string, {offset:number, length:number}>} */
    const tables = {};
    if (base + 12 > buf.length) return tables;
    const numTables = u16(buf, base + 4);
    for (let i = 0; i < numTables; i++) {
        const p = base + 12 + i * 16;
        if (p + 16 > buf.length) break;
        const tag = buf.toString('latin1', p, p + 4);
        tables[tag] = { offset: u32(buf, p + 8), length: u32(buf, p + 12) };
    }
    return tables;
}

/**
 * TTC 里的子字体偏移；普通 TTF/OTF 只有一个 0
 * @param {Buffer} buf
 * @returns {Array<number>}
 */
function sfntOffsets(buf) {
    if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'ttcf') {
        const count = u32(buf, 8);
        const offsets = [];
        for (let i = 0; i < count; i++) {
            const p = 12 + i * 4;
            if (p + 4 > buf.length) break;
            offsets.push(u32(buf, p));
        }
        return offsets;
    }
    return [0];
}

/**
 * name 表里的字符串（只取 ASCII/UTF-16BE 的常见组合）
 * @param {Buffer} buf
 * @param {{offset:number, length:number}} table
 * @param {number} nameId
 * @returns {string|null}
 */
function readName(buf, table, nameId) {
    if (!table || table.offset + 6 > buf.length) return null;
    const count = u16(buf, table.offset + 2);
    const stringOffset = table.offset + u16(buf, table.offset + 4);
    let fallback = null;
    for (let i = 0; i < count; i++) {
        const p = table.offset + 6 + i * 12;
        if (p + 12 > buf.length) break;
        const platformId = u16(buf, p);
        const currentNameId = u16(buf, p + 6);
        if (currentNameId !== nameId) continue;
        const length = u16(buf, p + 8);
        const offset = stringOffset + u16(buf, p + 10);
        if (offset + length > buf.length) continue;
        if (platformId === 3 || platformId === 0) {
            // UTF-16BE
            let s = '';
            for (let k = 0; k + 1 < length; k += 2) s += String.fromCharCode(u16(buf, offset + k));
            // 去掉 UTF-16 解码残留的 NUL（避免用带控制字符的正则，交给 split/join）
            return s.split(String.fromCharCode(0)).join('').trim();
        }
        if (platformId === 1 && fallback === null) {
            fallback = buf.toString('latin1', offset, offset + length).trim();
        }
    }
    return fallback;
}

/**
 * 解析一个字体文件里的某个子字体，得到度量所需的原始表数据
 * @param {string} file
 * @param {number} faceIndex
 * @returns {any|null}
 */
function loadFace(file, faceIndex) {
    const key = file + '#' + faceIndex;
    if (faceCache.has(key)) return faceCache.get(key);
    let buf;
    try {
        buf = fs.readFileSync(file);
    } catch (error) {
        faceCache.set(key, null);
        return null;
    }
    const offsets = sfntOffsets(buf);
    const base = offsets[faceIndex] || offsets[0] || 0;
    const tables = readTables(buf, base);
    if (!tables.head || !tables.hhea || !tables.hmtx || !tables.cmap) {
        faceCache.set(key, null);
        return null;
    }
    const unitsPerEm = u16(buf, tables.head.offset + 18) || 1000;
    const numberOfHMetrics = u16(buf, tables.hhea.offset + 34) || 0;
    const ascender = i16(buf, tables.hhea.offset + 4);
    const descender = i16(buf, tables.hhea.offset + 6);
    const numGlyphs = tables.maxp ? u16(buf, tables.maxp.offset + 4) : 0;
    const face = {
        file,
        faceIndex,
        buf,
        tables,
        unitsPerEm,
        numberOfHMetrics,
        numGlyphs,
        ascender,
        descender,
        /** @type {Map<number, number>|null} */
        cmapCache: null,
        family: readName(buf, tables.name, 16) || readName(buf, tables.name, 1) || path.basename(file),
        subfamily: readName(buf, tables.name, 2) || 'Regular',
    };
    faceCache.set(key, face);
    return face;
}

/**
 * 构建 unicode → glyphId 的映射（只解析实际用到的 cmap 子表）
 * @param {any} face
 * @returns {{lookup: (cp:number)=>number, format: number}}
 */
function buildCmap(face) {
    const buf = face.buf;
    const table = face.tables.cmap;
    const numTables = u16(buf, table.offset + 2);
    /** @type {{offset:number}|null} */
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < numTables; i++) {
        const p = table.offset + 4 + i * 8;
        if (p + 8 > buf.length) break;
        const platform = u16(buf, p);
        const encoding = u16(buf, p + 2);
        const offset = table.offset + u32(buf, p + 4);
        // 优先级：(3,10) UCS-4 > (3,1) BMP > (0,x) Unicode
        let score = 0;
        if (platform === 3 && encoding === 10) score = 3;
        else if (platform === 3 && encoding === 1) score = 2;
        else if (platform === 0) score = 1;
        if (score > bestScore) {
            bestScore = score;
            best = { offset };
        }
    }
    if (!best) return { lookup: () => 0, format: -1 };
    const sub = best.offset;
    const format = u16(buf, sub);

    if (format === 12) {
        const groupCount = u32(buf, sub + 12);
        const groups = [];
        for (let i = 0; i < groupCount; i++) {
            const p = sub + 16 + i * 12;
            if (p + 12 > buf.length) break;
            groups.push([u32(buf, p), u32(buf, p + 4), u32(buf, p + 8)]);
        }
        return {
            format,
            lookup(cp) {
                let lo = 0;
                let hi = groups.length - 1;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    const g = groups[mid];
                    if (cp < g[0]) hi = mid - 1;
                    else if (cp > g[1]) lo = mid + 1;
                    else return g[2] + (cp - g[0]);
                }
                return 0;
            },
        };
    }

    if (format === 4) {
        const segCountX2 = u16(buf, sub + 6);
        const segCount = segCountX2 / 2;
        const endOff = sub + 14;
        const startOff = endOff + segCountX2 + 2;
        const deltaOff = startOff + segCountX2;
        const rangeOff = deltaOff + segCountX2;
        return {
            format,
            lookup(cp) {
                if (cp > 0xFFFF) return 0;
                for (let i = 0; i < segCount; i++) {
                    const end = u16(buf, endOff + i * 2);
                    if (cp > end) continue;
                    const start = u16(buf, startOff + i * 2);
                    if (cp < start) return 0;
                    const delta = i16(buf, deltaOff + i * 2);
                    const rangeOffsetPos = rangeOff + i * 2;
                    const rangeOffset = u16(buf, rangeOffsetPos);
                    if (rangeOffset === 0) return (cp + delta) & 0xFFFF;
                    const glyphPos = rangeOffsetPos + rangeOffset + (cp - start) * 2;
                    if (glyphPos + 2 > buf.length) return 0;
                    const glyph = u16(buf, glyphPos);
                    return glyph === 0 ? 0 : (glyph + delta) & 0xFFFF;
                }
                return 0;
            },
        };
    }

    if (format === 6) {
        const firstCode = u16(buf, sub + 6);
        const entryCount = u16(buf, sub + 8);
        return {
            format,
            lookup(cp) {
                const idx = cp - firstCode;
                if (idx < 0 || idx >= entryCount) return 0;
                return u16(buf, sub + 10 + idx * 2);
            },
        };
    }

    if (format === 0) {
        return {
            format,
            lookup(cp) {
                if (cp < 0 || cp > 255) return 0;
                return buf[sub + 6 + cp] || 0;
            },
        };
    }

    return { lookup: () => 0, format };
}

/**
 * 单个字形的前进宽度（字体设计单位）
 * @param {any} face
 * @param {number} glyphId
 * @returns {number}
 */
function advanceUnits(face, glyphId) {
    const buf = face.buf;
    const mtx = face.tables.hmtx.offset;
    const count = face.numberOfHMetrics;
    if (count <= 0) return 0;
    const index = glyphId < count ? glyphId : count - 1;
    const pos = mtx + index * 4;
    if (pos + 2 > buf.length) return 0;
    return u16(buf, pos);
}

/** @param {string} font CSS font 简写（如 `italic bold 12px "Arial"`） */
function parseFontShorthand(font) {
    const text = String(font || '12px sans-serif');
    const sizeMatch = /([\d.]+)\s*px/.exec(text);
    const sizePx = sizeMatch ? parseFloat(sizeMatch[1]) : 12;
    const italic = /italic|oblique/i.test(text);
    const bold = /bold|[6-9]00\b/i.test(text);
    let family = '';
    const afterSize = text.slice(sizeMatch ? sizeMatch.index + sizeMatch[0].length : 0).trim();
    if (afterSize) family = afterSize.split(',')[0].trim();
    family = family.replace(/^"([^"]*)"$/, '$1').replace(/^'([^']*)'$/, '$1').trim();
    if (!family) family = 'sans-serif';
    return { sizePx, italic, bold, family };
}

/** @type {Array<string>|null} */
let fontFilesCache = null;
/** @type {Map<string, Array<any>>} */
const facesOfFileCache = new Map();
/** @type {Map<string, any>} */
const candidateCache = new Map();

/** 系统字体文件列表（惰性、去重） @returns {Array<string>} */
function listFontFiles() {
    if (fontFilesCache) return fontFilesCache;
    const files = [];
    for (const dir of fontSearchDirs()) walkFontFiles(dir, 0, files);
    fontFilesCache = [...new Set(files)];
    return fontFilesCache;
}

/**
 * 读取某个字体文件里所有子字体的 name 信息（不含 hmtx/cmap，很快）
 * @param {string} file
 * @returns {Array<any>}
 */
function facesOfFile(file) {
    const cached = facesOfFileCache.get(file);
    if (cached) return cached;
    /** @type {Array<any>} */
    const faces = [];
    let buf;
    try {
        buf = fs.readFileSync(file);
    } catch (error) {
        facesOfFileCache.set(file, faces);
        return faces;
    }
    const offsets = sfntOffsets(buf);
    for (let i = 0; i < offsets.length; i++) {
        const tables = readTables(buf, offsets[i]);
        if (!tables.name || !tables.head || !tables.hmtx || !tables.cmap) continue;
        const family = readName(buf, tables.name, 16) || readName(buf, tables.name, 1);
        if (!family) continue;
        const subfamily = readName(buf, tables.name, 2) || 'Regular';
        faces.push({
            file,
            faceIndex: i,
            family,
            subfamily,
            bold: /bold|black|heavy|semibold|demibold/i.test(subfamily),
            italic: /italic|oblique/i.test(subfamily),
        });
    }
    facesOfFileCache.set(file, faces);
    return faces;
}

/** 建立「家族名（小写）→ 字形文件候选」全量索引（文件名启发失败时的兜底） @returns {Map<string, Array<any>>} */
function buildFamilyIndex() {
    if (familyIndex) return familyIndex;
    familyIndex = new Map();
    for (const file of listFontFiles()) {
        for (const face of facesOfFile(file)) {
            const key = familyKey(face.family);
            const list = familyIndex.get(key);
            if (list) list.push(face);
            else familyIndex.set(key, [face]);
        }
    }
    return familyIndex;
}

// 日文字体名里的假名术语 → 拉丁拼写（'ＭＳ ゴシック' → 'msgothic'），
// 否则全角/片假名写法的 Windows 字体名永远匹配不上文件名。
const KANA_TERMS = [
    ['ゴシック', 'gothic'],
    ['明朝', 'mincho'],
    ['丸ゴシック', 'marugothic'],
];

/**
 * 家族名归一化：NFKC（全角转半角）+ 假名术语转写 + 去分隔符
 * @param {string} name
 */
function tokenizeName(name) {
    let s = String(name || '').normalize('NFKC').toLowerCase();
    for (const [kana, latin] of KANA_TERMS) s = s.split(kana).join(latin);
    return s.replace(/[\s\-_]/g, '');
}

/** 查别名表用的键（保留空格分隔，NFKC + 假名转写） @param {string} name */
function familyKey(name) {
    let s = String(name || '').normalize('NFKC').trim().toLowerCase();
    for (const [kana, latin] of KANA_TERMS) s = s.split(kana).join(latin);
    return s.replace(/\s+/g, ' ');
}

/**
 * 在候选池里按风格挑一个
 * @param {Array<any>} pool
 * @param {boolean} bold
 * @param {boolean} italic
 * @returns {any|null}
 */
function pickByStyle(pool, bold, italic) {
    let best = null;
    let bestScore = -1;
    for (const item of pool) {
        let score = 0;
        if (item.bold === bold) score += 2;
        if (item.italic === italic) score += 1;
        if (score > bestScore) {
            bestScore = score;
            best = item;
        }
    }
    return best;
}

/**
 * 按名字（含别名与风格）挑选字形文件
 * @param {string} family
 * @param {boolean} bold
 * @param {boolean} italic
 * @returns {any|null}
 */
function findCandidate(family, bold, italic) {
    const cacheKey = familyKey(family) + "|" + (bold ? "b" : "") + (italic ? "i" : "");
    if (candidateCache.has(cacheKey)) return candidateCache.get(cacheKey);

    const wanted = [familyKey(family)];
    const aliases = FAMILY_ALIASES[familyKey(family)];
    if (aliases) for (const a of aliases) wanted.push(familyKey(a));

    // 快路径：按「请求名 → 别名」的优先顺序逐个解析，先用文件名过滤
    // （Arial.ttf / Arial Bold.ttf …），只读少量文件的 name 表。
    // ⚠️ 不能把所有候选混在一个池里选：Arial 与它的别名 Helvetica 风格分相同时，
    // 池内先入者会赢（曾导致 Arial 被解析成 Helvetica）。
    for (const name of wanted) {
        const token = tokenizeName(name);
        if (!token) continue;
        const pool = [];
        for (const file of listFontFiles()) {
            const base = tokenizeName(path.basename(file).replace(/\.[^.]+$/, ''));
            if (!(base.includes(token) || token.includes(base))) continue;
            for (const face of facesOfFile(file)) {
                if (familyKey(face.family) === name) pool.push(face);
            }
        }
        const best = pickByStyle(pool, bold, italic);
        if (best) {
            candidateCache.set(cacheKey, best);
            return best;
        }
    }

    // 兜底：文件名不规范（或家族名只在 name 表里）时走全量索引，仍按优先顺序
    const index = buildFamilyIndex();
    for (const name of wanted) {
        const list = index.get(name);
        if (!list || !list.length) continue;
        const best = pickByStyle(list, bold, italic);
        if (best) {
            candidateCache.set(cacheKey, best);
            return best;
        }
    }

    candidateCache.set(cacheKey, null);
    return null;
}

// 缺字形时的回退链（对齐 Windows 的字体链接行为：ASCII 字体里没有的 CJK/符号
// 由系统字体补上）。顺序按覆盖面从大到小；命中后逐码位缓存。
const FALLBACK_FAMILIES = [
    'Helvetica', 'Arial', 'DejaVu Sans',
    'PingFang SC', 'Hiragino Sans', 'Hiragino Sans GB', 'Apple SD Gothic Neo',
    'Noto Sans CJK SC', 'Noto Sans',
    'Apple Symbols', 'Segoe UI Symbol',
];
/** @type {Array<any>|null} */
let fallbackFaces = null;
/** @type {Map<number, {face:any, glyph:number}|null>} */
const glyphFallbackCache = new Map();

/** 惰性加载回退字体集合 @returns {Array<any>} */
function getFallbackFaces() {
    if (fallbackFaces) return fallbackFaces;
    fallbackFaces = [];
    for (const family of FALLBACK_FAMILIES) {
        const candidate = findCandidate(family, false, false);
        if (!candidate) continue;
        const face = loadFace(candidate.file, candidate.faceIndex);
        if (!face) continue;
        if (!face.cmapCache) face.cmapCache = buildCmap(face);
        fallbackFaces.push(face);
    }
    return fallbackFaces;
}

/**
 * 在回退字体里找一个含该码位的字形
 * @param {number} cp
 * @returns {{face:any, glyph:number}|null}
 */
function lookupFallbackGlyph(cp) {
    const cached = glyphFallbackCache.get(cp);
    if (cached !== undefined) return cached;
    let hit = null;
    for (const face of getFallbackFaces()) {
        const glyph = face.cmapCache.lookup(cp);
        if (glyph > 0) {
            hit = { face, glyph };
            break;
        }
    }
    glyphFallbackCache.set(cp, hit);
    return hit;
}

/**
 * 量文本宽度（像素）。字体找不到时返回 null；个别字符缺字形时按字体回退链补宽度。
 * @param {string} font
 * @param {string} text
 * @returns {number|null}
 */
function measureWidth(font, text) {
    const { sizePx, italic, bold, family } = parseFontShorthand(font);
    const candidate = findCandidate(family, bold, italic);
    if (!candidate) return null;
    const face = loadFace(candidate.file, candidate.faceIndex);
    if (!face) return null;
    if (!face.cmapCache) face.cmapCache = buildCmap(face);
    const cmap = face.cmapCache;
    const value = String(text == null ? '' : text);
    let total = 0;
    for (const ch of value) {
        const cp = ch.codePointAt(0) || 0;
        const glyph = cmap.lookup(cp);
        if (glyph > 0) {
            total += advanceUnits(face, glyph) / face.unitsPerEm;
            continue;
        }
        // 主字体缺字形：走回退链（Windows 的行为是字体链接，而非画 .notdef）
        const fallback = lookupFallbackGlyph(cp);
        if (fallback) total += advanceUnits(fallback.face, fallback.glyph) / fallback.face.unitsPerEm;
        else total += advanceUnits(face, 0) / face.unitsPerEm;
    }
    return total * sizePx;
}

/**
 * 创建可直接喂给 SvgContext.setMeasureProvider / PdfContext.setMeasureProvider 的函数。
 * 字体不在系统里时返回 null，调用方自动回退到估算。
 * @returns {(font: string, text: string) => number|null}
 */
function createMeasureProvider() {
    return (font, text) => measureWidth(font, text);
}

/** 诊断用：当前索引到的家族数量 @returns {number} */
function familyCount() {
    return buildFamilyIndex().size;
}

/** 诊断用：某个名字能否解析到字体文件（含别名回退） @returns {string|null} */
function resolveFamily(family) {
    const c = findCandidate(family, false, false);
    return c ? c.file : null;
}

/**
 * 诊断用：系统里是否存在**同名**字体（不走别名回退）。
 * 验证度量精度时必须区分"真字体"与"别名回退"，否则会把宿主字体差异算成解析误差。
 * @param {string} family
 * @returns {boolean}
 */
function hasFamily(family) {
    const c = findCandidate(family, false, false);
    return !!c && familyKey(c.family) === familyKey(family);
}

module.exports = {
    createMeasureProvider,
    measureWidth,
    parseFontShorthand,
    familyCount,
    resolveFamily,
    hasFamily,
    FAMILY_ALIASES
};
