/*
    dvi-decode. A driver for decoding device independent files produced by LuaTeX.
    Copyright (C) 2022  Matthew J. Penwill
 
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
 
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
 
    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
  */
import opentype from 'opentype.js';
import { isBrowser, isNode } from 'browser-or-node';
import { parse } from 'lua-json';
const banner = "This is dvi-decode, Version 0.1";
const lineLength = 79; /* bracketed lines of output will be at most this long */
const stackSize = 100; /* DVI files shouldn't push beyond this depth */
const set_char_0 = 0; /*typeset character 0 and move right*/
const set1 = 128; /*typeset a character and move right*/
const set_rule = 132; /*typeset a rule and move right*/
const put1 = 133; /*typeset a character*/
const put_rule = 137; /*typeset a rule*/
const nop = 138; /*no operation*/
const bop = 139; /*beginning of page*/
const eop = 140; /*ending of page*/
const push = 141; /*save the current positions*/
const pop = 142; /*restore previous positions*/
const right1 = 143; /*move right*/
const w0 = 147; /*move right by |w|*/
const w1 = 148; /*move right and set |w|*/
const x0 = 152; /*move right by |x|*/
const x1 = 153; /*move right and set |x|*/
const down1 = 157; /*move down*/
const y0 = 161; /*move down by |y|*/
const y1 = 162; /*move down and set |y|*/
const z0 = 166; /*move down by |z|*/
const z1 = 167; /*move down and set |z|*/
const fnt_num_0 = 171; /*set current font to 0*/
const fnt1 = 235; /*set current font*/
const xxx1 = 239; /*extension to `dvi` primitives*/
const xxx4 = 242; /*potentially long extension to `dvi` primitives*/
const fnt_def1 = 243; /*define the meaning of a font number*/
const pre = 247; /*preamble*/
const post = 248; /*postamble beginning*/
const post_post = 249; /*postamble ending*/
const undefined_command_1 = 250;
const undefined_command_2 = 251;
const undefined_command_3 = 252;
const undefined_command_4 = 253;
const undefined_command_5 = 254;
const undefined_command_6 = 255;
const idByte = 2; /* identifies the kind of DVI files described here */
const infinity = 0o17777777777; /* (approximately) */
const invalidWidth = infinity;
const notDefGlyph = 0;
//const maxDrift = 2 /* we insist that abs(hh-Math.round(conv*(h))) <= maxDrift */
let pDviData;
let pLuaFontPath;
let pDisplayDPI;
let k, m, n, p, q; /* general purpose registers */
let firstPass;
let fontPromises;
let outDoc;
let log;
let dviDataLoc = 0; /* where we are about to look, in pDviData */
let pFontMap; /* map of external font file names to paths */
let dviFontMap = new Map(); /* the collection of all dvi fonts */
//let fntCheckSum: number; /* check sum found in the font file - currently disabled since font checksum is not exposed in opentype.js api */
let fntConv; /* DVI units per absolute font unit */
let pDebugMode; /* logs informational messages using the log function */
let pNewMag; /* if positive, overrides the postamble's magnification */
let startCount; /* count values to select starting page */
let startThere; /* is the startCount value relevant? */
let startVals; /* the last count considered significant */
const count = []; /* the count values on the current page */
let inPostamble; /* are we reading the postamble */
let textBuf; /* saved characters */
let h, v, w, x, y, z, hh, vv; /* current state values */
let hStack = [], vStack = [], wStack = [], xStack = [], yStack = [], zStack = []; /* pushed down values in DVI units */
let hhStack = [], vvStack = []; /* pushed down values in pixels */
let maxV; /* the value of Math.abs(v) should probably not exceed this */
let maxH; /* the value of Math.abs(h) should probably not exceed this */
let maxS; /* the stack depth should not exceed this */
let maxVSoFar, maxHSoFar, maxSSoFar; /* the record high levels */
let totalPages; /* the stated total number of pages */
let pageCount; /* the total number of pages seen so far */
let outPg;
let a; /* byte number of the current command */
let s; /* current stack size */
let ss; /* stack size to print */
let curDviFont; /* current internal font */
let oldBackpointer; /* the previous bop command location */
let newBackpointer; /* the current |bop| command location */
let started; /* has the starting page been found? */
let postLoc; /* byte location where the postamble begins */
let firstBackpointer; /* the pointer following post */
let startLoc; /* byte location of the first page to process */
let afterPre; /* byte location immediately following the preamble */
let conv; /* converts DVI units to pixels */
let trueConv; /* converts unmagnified DVI units to pixels */
let numerator, denominator; /* stated conversion ratio */
let mag; /* magnification factor times 1000 */
export async function dviDecode(dviData, displayDPI, magnification, fontMap, luaFontPath, debugMode, logFunc) {
    return new Promise((resolve, reject) => {
        log = logFunc ? logFunc : console.log;
        startVals = 0;
        startCount = [];
        startCount.push(1);
        startThere = [];
        startThere.push(true);
        k = 0;
        m = 0;
        n = 0;
        p = 0;
        q = 0;
        firstPass = true;
        fontPromises = [];
        dviDataLoc = 0;
        dviFontMap.clear();
        //fntCheckSum = 0;
        fntConv = 0;
        conv = 0;
        trueConv = 0;
        numerator = 0;
        denominator = 0;
        mag = 0;
        inPostamble = false;
        textBuf = '';
        h = 0;
        v = 0;
        w = 0;
        x = 0;
        y = 0;
        z = 0;
        hh = 0;
        vv = 0;
        hStack = [];
        vStack = [];
        wStack = [];
        xStack = [];
        yStack = [];
        zStack = [];
        hhStack = [];
        vvStack = [];
        maxV = 0o17777777777 - 99;
        maxH = 0o17777777777 - 99;
        maxS = stackSize + 1;
        maxVSoFar = 0;
        maxHSoFar = 0;
        maxSSoFar = 0;
        totalPages = 0;
        pageCount = 0;
        a = 0;
        s = 0;
        ss = 0;
        oldBackpointer = -1;
        newBackpointer = -1;
        started = false;
        postLoc = 0;
        firstBackpointer = -1;
        startLoc = 0;
        afterPre = 0;
        outDoc = {
            fonts: [],
            pages: []
        };
        try {
            pDviData = dviData;
            if (pDviData === null || undefined)
                throw '!No DVI input provided.';
            pDisplayDPI = displayDPI === (null || undefined) ? 96 : displayDPI;
            pNewMag = magnification === (null || undefined) ? 0 : magnification;
            pLuaFontPath = luaFontPath === (null || undefined) ? '' : luaFontPath.endsWith('/') ? luaFontPath : luaFontPath + '/';
            pFontMap = fontMap;
            pDebugMode = debugMode === (null || undefined) ? false : debugMode;
            log(banner);
            log('Options selected:');
            let sp = '';
            for (let k = 0; k <= startVals; k++) {
                if (startThere[k]) {
                    sp = sp + startCount[k].toString();
                }
                else {
                    sp = sp + '*';
                }
                if (k < startVals) {
                    sp = sp + '.';
                }
                else {
                    sp = sp + ' ';
                }
            }
            const om = pDebugMode ? 'ON' : 'OFF';
            log('  Debug mode is ' + om);
            log('  Starting page = ' + sp);
            log('  Resolution = ' + pDisplayDPI.toString() + ' pixels per inch');
            if (pNewMag > 0)
                log('  New magnification factor = ' + (pNewMag / 1000).toString() + 'x');
            p = getByte(); /* fetch the first byte */
            if (p !== pre)
                badDvi('First byte isn\'t start of preamble! (' + p.toString(16) + ')');
            p = getByte(); /* fetch the identification byte */
            if (p !== idByte)
                debugLog('identification in byte 1 should be ' + idByte.toString(16) + '!');
            numerator = signedQuad();
            denominator = signedQuad();
            if (numerator <= 0)
                badDvi('numerator is ' + numerator.toString());
            if (denominator <= 0)
                badDvi('denominator is ' + denominator.toString());
            debugLog('numerator/denominator=' + numerator.toString() + '/' + denominator.toString());
            fntConv = (25400000.0 / numerator) * (denominator / 473628672) / 16.0;
            conv = (numerator / 254000.0) * (pDisplayDPI / denominator);
            mag = signedQuad();
            if (pNewMag > 0) {
                mag = pNewMag;
            }
            else {
                if (mag <= 0)
                    badDvi('magnification is ' + mag.toString());
            }
            trueConv = conv;
            conv = trueConv * (mag / 1000.0);
            debugLog('magnification=' + mag.toString() + '; ' + conv.toString() + ' pixels per DVI unit');
            p = getByte(); /* fetch the length of the introductory comment */
            let comment = '';
            while (p > 0) {
                p--;
                comment = comment + String.fromCodePoint(getByte());
            }
            debugLog('\'' + comment + '\'');
            afterPre = dviDataLoc;
            firstPass = true;
            maxVSoFar = 0;
            maxHSoFar = 0;
            maxSSoFar = 0;
            pageCount = 0;
            n = pDviData.length;
            if (n < 53)
                badDvi('only ' + n.toString() + ' bytes long');
            m = n - 4;
            do {
                if (m === 0)
                    badDvi('all 223s');
                dviDataLoc = m;
                k = getByte();
                m--;
            } while (k === 223);
            if (k !== idByte)
                badDvi('ID byte is ' + k.toString());
            dviDataLoc = m - 3;
            q = signedQuad();
            if ((q < 0) || (q > m - 33))
                badDvi('post pointer ' + q.toString() + ' at byte ' + (m - 3).toString());
            dviDataLoc = q;
            k = getByte();
            if (k !== post)
                badDvi('byte ' + q.toString() + ' is not post');
            postLoc = q;
            firstBackpointer = signedQuad();
            inPostamble = true;
            readPostamble();
            inPostamble = false;
            firstPass = false;
            Promise.all(fontPromises)
                .then(() => {
                maxVSoFar = 0;
                maxHSoFar = 0;
                maxSSoFar = 0;
                pageCount = 0;
                dviDataLoc = afterPre;
                let cc; /* command code */
                do {
                    if (dviDataLoc >= pDviData.length)
                        badDvi('the file ended prematurely');
                    cc = getByte();
                    if ((firstPass) && (cc >= fnt_def1) && (cc < fnt_def1 + 4)) {
                        fontPromises.push(defineFont(firstPar(k)));
                        k = nop;
                    }
                } while (cc === nop);
                if (cc === post) {
                    inPostamble = true;
                }
                else {
                    if (cc !== bop)
                        badDvi('byte ' + (dviDataLoc - 1).toString() + ' is not bop');
                    newBackpointer = dviDataLoc - 1;
                    pageCount++;
                    count.length = 0;
                    for (let k = 0; k < 10; k++)
                        count.push(signedQuad());
                    if (signedQuad() !== oldBackpointer)
                        debugLog('backpointer in byte ' + (dviDataLoc - 4).toString() + ' should be ' + oldBackpointer.toString() + '!');
                    oldBackpointer = newBackpointer;
                }
                pageCount = 0;
                {
                    let pg;
                    while (true) {
                        debugLog(' ');
                        pg = '';
                        for (let k = 0; k <= startVals; k++) {
                            pg = pg + count[k].toString();
                            if (k < startVals) {
                                pg = pg + '.';
                            }
                            else {
                                pg = pg + ' ';
                            }
                        }
                        debugLog((dviDataLoc - 45).toString() + ': beginning of page ' + pg);
                        if (!doPage())
                            badDvi('page ended unexpectedly');
                        outDoc.pages.push(outPg);
                        let cc; /* command code */
                        do {
                            if (dviDataLoc >= pDviData.length)
                                badDvi('the file ended prematurely');
                            cc = getByte();
                            if ((firstPass) && (cc >= fnt_def1) && (cc < fnt_def1 + 4)) {
                                fontPromises.push(defineFont(firstPar(k)));
                                k = nop;
                            }
                        } while (cc === nop);
                        if (cc === post) {
                            inPostamble = true;
                        }
                        else {
                            if (cc !== bop)
                                badDvi('byte ' + (dviDataLoc - 1).toString() + ' is not bop');
                            newBackpointer = dviDataLoc - 1;
                            pageCount++;
                            count.length = 0;
                            for (let k = 0; k < 10; k++)
                                count.push(signedQuad());
                            if (signedQuad() !== oldBackpointer)
                                debugLog('backpointer in byte ' + (dviDataLoc - 4).toString() + ' should be ' + oldBackpointer.toString() + '!');
                            oldBackpointer = newBackpointer;
                        }
                        if (inPostamble)
                            break;
                    }
                }
                const uniqueFontNames = [];
                dviFontMap.forEach(dviFont => {
                    if (uniqueFontNames.indexOf(dviFont.fontName) === -1) {
                        uniqueFontNames.push(dviFont.fontName);
                        outDoc.fonts.push({
                            fontNum: uniqueFontNames.indexOf(dviFont.fontName),
                            fontName: dviFont.fontName,
                            fontPath: dviFont.fontPath,
                            fontFeatures: dviFont.fontFeatures
                        });
                    }
                });
                const fontMap = new Map();
                dviFontMap.forEach(dviFont => {
                    fontMap.set(dviFont.fontNum, uniqueFontNames.indexOf(dviFont.fontName));
                });
                outDoc.pages.forEach(page => {
                    /* Replace the font number with the consolidated font number */
                    page.pageFonts.forEach(pageFont => {
                        pageFont.fontNum = fontMap.get(pageFont.fontNum);
                    });
                    /* We may now have duplicate page fonts, which can be merged */
                    let newPageFonts = [];
                    page.pageFonts.forEach(pageFont => {
                        const fontIndex = newPageFonts.findIndex(pf => pf.fontNum === pageFont.fontNum);
                        if (fontIndex > -1) {
                            newPageFonts[fontIndex].glyphs = newPageFonts[fontIndex].glyphs.concat(pageFont.glyphs);
                        }
                        else {
                            newPageFonts.push(pageFont);
                        }
                    });
                    page.pageFonts = newPageFonts.sort((f1, f2) => f1.fontNum - f2.fontNum);
                    /* And we may then have duplicate glyph entries, which can also be merged */
                    page.pageFonts.forEach(pageFont => {
                        let newFontGlyphs = [];
                        pageFont.glyphs.forEach(glyph => {
                            const glyphIndex = newFontGlyphs.findIndex(g => g.glyphIndex === glyph.glyphIndex);
                            if (glyphIndex > -1)
                                newFontGlyphs[glyphIndex].glyphSizes = newFontGlyphs[glyphIndex].glyphSizes.concat(glyph.glyphSizes);
                            else
                                newFontGlyphs.push(glyph);
                        });
                        pageFont.glyphs = newFontGlyphs.sort((g1, g2) => g1.glyphIndex - g2.glyphIndex);
                    });
                });
                resolve(JSON.stringify(outDoc));
            })
                .catch((e) => { reject(e.toString()); });
        }
        catch (e) {
            if (e instanceof Error)
                reject('!Error ' + e.name + ': ' + e.message);
        }
    });
}
function abort(s) {
    throw new Error(s);
}
function badDvi(s) {
    abort('Bad DVI file: ' + s + '!');
}
function getByte() {
    if (dviDataLoc >= pDviData.length) {
        return 0;
    }
    else {
        return pDviData[dviDataLoc++];
    }
}
function signedByte() {
    const b = pDviData[dviDataLoc++];
    if (b < 128) {
        return b;
    }
    else {
        return b - 256;
    }
}
function getTwoBytes() {
    const a = pDviData[dviDataLoc++];
    const b = pDviData[dviDataLoc++];
    return a * 256 + b;
}
function signedPair() {
    const a = pDviData[dviDataLoc++];
    const b = pDviData[dviDataLoc++];
    if (a < 128) {
        return a * 256 + b;
    }
    else {
        return (a - 256) * 256 + b;
    }
}
function getThreeBytes() {
    const a = pDviData[dviDataLoc++];
    const b = pDviData[dviDataLoc++];
    const c = pDviData[dviDataLoc++];
    return (a * 256 + b) * 256 + c;
}
function signedTrio() {
    const a = pDviData[dviDataLoc++];
    const b = pDviData[dviDataLoc++];
    const c = pDviData[dviDataLoc++];
    if (a < 128) {
        return (a * 256 + b) * 256 + c;
    }
    else {
        return ((a - 256) * 256 + b) * 256 + c;
    }
}
function signedQuad() {
    const a = pDviData[dviDataLoc++];
    const b = pDviData[dviDataLoc++];
    const c = pDviData[dviDataLoc++];
    const d = pDviData[dviDataLoc++];
    if (a < 128) {
        return ((a * 256 + b) * 256 + c) * 256 + d;
    }
    else {
        return (((a - 256) * 256 + b) * 256 + c) * 256 + d;
    }
}
function inputFont(dviFont, otfFont) {
    let k; /* index for loops */
    const headTable = otfFont.tables['head'];
    //fntCheckSum = headTable.checksum;
    dviFont.fontOtfUnitsPerEm = headTable.unitsPerEm;
    const charCount = otfFont.glyphs.length;
    const bc = 0;
    const ec = charCount - 1;
    if (charCount > 0) {
        let pixelsPerEm = (dviFont.fontScaledPointSize * pDisplayDPI) / 72.27;
        let dviUnitPerEm = (1 / conv) * pixelsPerEm;
        dviFont.fontOtfUnitConv = (1 / dviFont.fontOtfUnitsPerEm) * dviUnitPerEm;
        let glyph;
        let gw;
        for (k = 0; k < charCount; k++) {
            glyph = otfFont.glyphs.get(k);
            gw = glyph.advanceWidth;
            if (gw)
                dviFont.width.push(Math.round(gw * dviFont.fontOtfUnitConv));
            else
                dviFont.width.push(0);
        }
    }
    if (charCount > 0) {
        for (k = 0; k < charCount; k++) {
            if (dviFont.width[k] === 0) {
                dviFont.pixelWidth.push(0);
            }
            else {
                dviFont.pixelWidth.push(Math.round(conv * dviFont.width[k]));
            }
        }
    }
    dviFont.fontBc = bc;
    dviFont.fontEc = ec;
    return true;
}
function startMatch() {
    let match = true; /* does everything match so far? */
    for (k = 0; k <= startVals; k++) {
        if (startThere[k] && (startCount[k] !== count[k]))
            match = false;
    }
    return match;
}
async function defineFont(e) {
    let d, m; /* design size, magnification */
    let dviFont; /* the font being defined */
    let otfFont;
    let st = '';
    let curDviFontFile = ''; /* external font file name */
    try {
        let curDviFontName = '';
        let curDviFontPath = '';
        let curDviFontFeatures = '';
        const c = signedQuad(); /* checksum */
        const q = signedQuad(); /* scaled size */
        d = signedQuad();
        if ((q <= 0) || (d <= 0)) {
            m = 1000;
        }
        else {
            m = Math.round((1000.0 * conv * q) / (trueConv * d));
        }
        const p = getByte(); /* length of the directory spec */
        const n = getByte(); /* length of the font name proper */
        st = st + 'Font ' + e.toString() + ': ';
        if ((n + p) === 0) {
            debugLog('null font name!');
        }
        else {
            let cc;
            for (k = 0; k < (n + p); k++) {
                cc = getByte();
                if ((cc !== 0o133) && (cc !== 0o135))
                    curDviFontName = curDviFontName + String.fromCodePoint(cc);
            }
            let words = curDviFontName.split(':');
            const leftSide = words[0];
            const rightSide = (words.length > 1) ? words[1] : '';
            words = leftSide.split('/');
            curDviFontName = words[words.length - 1];
            curDviFontFeatures = rightSide;
            if (!curDviFontFeatures.includes('mode=harf') || !curDviFontFeatures.includes('shaper=ot'))
                badDvi('OpenType renderer option not found for font ' + curDviFontName + ':' + curDviFontFeatures + ', try adding Renderer=OpenType to font definition in the LaTeX source.');
        }
        st = st + curDviFontName;
        curDviFontFile = curDviFontName;
        if (pFontMap) {
            const fontPath = pFontMap.get(curDviFontName);
            if (fontPath) {
                curDviFontPath = fontPath.endsWith('/') ? fontPath : fontPath + '/';
                curDviFontFile = curDviFontPath + curDviFontFile;
            }
        }
        if (m !== 1000)
            st = st + ' scaled ' + m.toString();
        dviFont = dviFontMap.get(e);
        if (dviFont) {
            debugLog(st + '---this font was already defined.');
            {
                /*
                  if (dviFont.fontCheckSum !== c)
                    debugLog('---check sum of ' + c.toString() + ' doesn\'t match previous definition of ' + dviFont.fontCheckSum.toString() + '!');
                  */
                if (dviFont.fontNum !== e)
                    debugLog('---font num ' + e.toString() + ' doesn\'t match previous definition!');
                if (dviFont.fontScaledSize !== q)
                    debugLog('---scaled size of ' + q.toString() + ' doesn\'t match previous definition of ' + dviFont.fontScaledSize.toString() + '!');
                if (dviFont.fontDesignSize !== d)
                    debugLog('---design size of ' + d.toString() + ' doesn\'t match previous definition of ' + dviFont.fontDesignSize.toString() + '!');
                if (dviFont.fontName !== curDviFontName)
                    debugLog('---font name ' + curDviFontName + ' doesn\'t match previous definition!');
            }
        }
        else { /* add a new font definition */
            debugLog(st + '---this font wasn\'t loaded before.');
            dviFont = {
                fontNum: e,
                fontName: curDviFontName,
                fontPath: curDviFontPath,
                fontFeatures: curDviFontFeatures,
                fontCheckSum: c,
                fontScaledSize: q,
                fontDesignSize: d,
                fontScaledPointSize: ((mag / 1000) * q) / 65536,
                fontScaledPixelSize: Math.round(conv * q),
                fontOtfUnitsPerEm: 0,
                fontOtfUnitConv: 0,
                fontSpace: Math.floor(q / 6),
                fontBc: 0,
                fontEc: 0,
                width: [],
                pixelWidth: [],
                otfFont: undefined,
                luaGlyphs: new Map()
            };
            {
                try {
                    otfFont = await opentype.load(curDviFontFile);
                }
                catch (err) {
                    log('!Error loading font file ' + curDviFontFile);
                    throw err;
                }
                const luaFontFileName = pLuaFontPath + curDviFontName.split('.')[0].toLowerCase() + '.lua';
                try {
                    if (isBrowser) {
                        await fetch(luaFontFileName).then((response) => response.text())
                            .then((text) => {
                            const fontTableJSON = parse(text);
                            const fontTableMap = new Map(Object.entries(fontTableJSON));
                            const luaFontMap = new Map(Object.entries(fontTableMap.get("descriptions")));
                            luaFontMap.forEach((value, key) => {
                                let idx;
                                let uc;
                                for (const [k, v] of Object.entries(value)) {
                                    if (k === 'index')
                                        idx = v;
                                    if (k === 'unicode') {
                                        if (Number.parseInt(v) === NaN)
                                            uc = v;
                                        else
                                            uc = v;
                                    }
                                }
                                if (dviFont.luaGlyphs)
                                    dviFont.luaGlyphs.set(key, {
                                        index: idx,
                                        unicode: uc
                                    });
                            });
                        });
                    }
                    else if (isNode) {
                        const fsPromises = await import(/* webpackIgnore: true */ 'fs/promises');
                        await fsPromises.readFile(luaFontFileName).then((data) => data.toString())
                            .then((text) => {
                            const fontTableJSON = parse(text);
                            const fontTableMap = new Map(Object.entries(fontTableJSON));
                            const luaFontMap = new Map(Object.entries(fontTableMap.get("descriptions")));
                            luaFontMap.forEach((value, key) => {
                                let idx;
                                let uc;
                                for (const [k, v] of Object.entries(value)) {
                                    if (k === 'index')
                                        idx = v;
                                    if (k === 'unicode') {
                                        if (Number.parseInt(v) === NaN)
                                            uc = v;
                                        else
                                            uc = v;
                                    }
                                }
                                if (dviFont.luaGlyphs)
                                    dviFont.luaGlyphs.set(key, {
                                        index: idx,
                                        unicode: uc
                                    });
                            });
                        });
                    }
                }
                catch (err) {
                    log('!Error loading lua font table ' + luaFontFileName);
                    throw err;
                }
                debugLog('Font ' + e.toString() + ': file ' + curDviFontFile + ' opened:');
                if ((q <= 0) || (q >= 0o1000000000)) {
                    debugLog('---not loaded, bad scale (' + q.toString() + ')!');
                }
                else {
                    if ((d <= 0) || (d >= 0o1000000000)) {
                        debugLog('---not loaded, bad design size (' + d.toString() + ')!');
                    }
                    else {
                        if (inputFont(dviFont, otfFont)) {
                            /*
                              if ((c !== 0) && (fntCheckSum !== 0) && (c !== fntCheckSum)) {
                                debugLog('---beware: check sums do not agree!');
                                debugLog('   (' + c.toString() + ' vs. ' + fntCheckSum.toString() + ')');
                                debugLog('   ');
                              }
                              */
                            debugLog('---loaded at size ' + q.toString() + ' DVI units');
                            debugLog('---point size (scaled) is ' + dviFont.fontScaledPointSize.toString() + 'pt');
                            d = Math.round((100.0 * conv * q) / (trueConv * d));
                            if (d !== 100) {
                                debugLog(' (this font is magnified ' + d.toString() + '%)');
                                debugLog('   ');
                            }
                        }
                    }
                }
            }
            dviFont.otfFont = otfFont;
            dviFontMap.set(e, dviFont);
        }
    }
    catch (err) {
        log('!defineFont failed for font number ' + e.toString());
        throw err;
    }
}
function flushText() {
    if (textBuf !== '') {
        debugLog('[' + textBuf + ']');
        textBuf = '';
    }
}
function outGlyphIndex(c) {
    if (curDviFont && curDviFont.otfFont) {
        let pageFont = outPg.pageFonts.find(f => f.fontNum === curDviFont.fontNum);
        if (!pageFont) {
            pageFont = {
                fontNum: curDviFont.fontNum,
                glyphs: []
            };
            outPg.pageFonts.push(pageFont);
        }
        let outGlyph = pageFont.glyphs.find(g => g.glyphIndex === c);
        if (!outGlyph) {
            outGlyph = {
                glyphIndex: c,
                glyphSizes: []
            };
            pageFont.glyphs.push(outGlyph);
        }
        let glyphSize = outGlyph.glyphSizes.find(gs => gs.sz === curDviFont.fontScaledPixelSize);
        if (!glyphSize) {
            glyphSize = {
                sz: curDviFont.fontScaledPixelSize,
                glyphPlacements: []
            };
            outGlyph.glyphSizes.push(glyphSize);
        }
        glyphSize.glyphPlacements.push({ x: hh, y: vv });
    }
}
function outUnicode(u) {
    if (textBuf.length > lineLength - 2)
        flushText();
    //const v = u ? u as number : 46 // log a '.' character if there is no unicode value for the glyph
    textBuf = textBuf + String.fromCodePoint(u);
    if (curDviFont && curDviFont.otfFont) {
        const cmap = curDviFont.otfFont.tables.cmap;
        const gi = curDviFont.otfFont.tables.cmap.glyphIndexMap[u.toString()];
        if (gi) {
            outGlyphIndex(gi);
            return gi;
        }
        else {
            return undefined;
        }
    }
}
function firstPar(o) {
    if ((o >= set_char_0) && (o < set_char_0 + 128))
        return o - set_char_0;
    if ((o >= fnt_num_0) && (o < fnt_num_0 + 64))
        return o - fnt_num_0;
    switch (o) {
        case set1:
        case put1:
        case fnt1:
        case xxx1:
        case fnt_def1:
            return getByte();
        case set1 + 1:
        case put1 + 1:
        case fnt1 + 1:
        case xxx1 + 1:
        case fnt_def1 + 1:
            return getTwoBytes();
        case set1 + 2:
        case put1 + 2:
        case fnt1 + 2:
        case xxx1 + 2:
        case fnt_def1 + 2:
            return getThreeBytes();
        case right1:
        case w1:
        case x1:
        case down1:
        case y1:
        case z1:
            return signedByte();
        case right1 + 1:
        case w1 + 1:
        case x1 + 1:
        case down1 + 1:
        case y1 + 1:
        case z1 + 1:
            return signedPair();
        case right1 + 2:
        case w1 + 2:
        case x1 + 2:
        case down1 + 2:
        case y1 + 2:
        case z1 + 2:
            return signedTrio();
        case set1 + 3:
        case set_rule:
        case put1 + 3:
        case put_rule:
        case right1 + 3:
        case w1 + 3:
        case x1 + 3:
        case down1 + 3:
        case y1 + 3:
        case z1 + 3:
        case fnt1 + 3:
        case xxx1 + 3:
        case fnt_def1 + 3:
            return signedQuad();
        case nop:
        case bop:
        case eop:
        case push:
        case pop:
        case pre:
        case post:
        case post_post:
        case undefined_command_1:
        case undefined_command_2:
        case undefined_command_3:
        case undefined_command_4:
        case undefined_command_5:
        case undefined_command_6:
            return 0;
        case w0:
            return w;
        case x0:
            return x;
        case y0:
            return y;
        case z0:
            return z;
        default:
            return 0;
    }
}
function rulePixels(x) {
    const n = Math.trunc(conv * x);
    if (n < (conv * x)) {
        return n + 1;
    }
    else {
        return n;
    }
}
function specialCases(o, p) {
    let q; /* parameter of the current command */
    let k; /* loop index */
    let badChar; /* has a non-ASCII character code appeared in this xxx? */
    let vvv; /* v, rounded to the nearest pixel */
    function moveDown(s, p) {
        let fntSpace = curDviFont ? curDviFont.fontSpace : 0;
        if (Math.abs(p) >= (5 * fntSpace))
            vv = Math.round(conv * (v + p));
        else
            vv = vv + Math.round(conv * (p));
        if ((v > 0) && (p > 0)) {
            if (v > (infinity - p)) {
                error('arithmetic overflow! parameter changed from ' + p.toString() + ' to ' + (infinity - v).toString());
                p = infinity - v;
            }
        }
        if ((v < 0) && (p < 0)) {
            if (-v > (p + infinity)) {
                error('arithmetic overflow! parameter changed from ' + p.toString() + ' to ' + ((-v) - infinity).toString());
                p = (-v) - infinity;
            }
        }
        /*
          vvv = Math.round(conv * (v + p));
          if (Math.abs(vvv - vv) > maxDrift) {
            if (vvv > vv) {
              vv = vvv - maxDrift
            } else {
              vv = vvv + maxDrift;
            }
          }
          */
        let st = '';
        if (pDebugMode) {
            st = st + ' v=' + v.toString();
            if (p >= 0)
                st = st + '+';
            st = st + p.toString() + '=' + (v + p).toString() + ', vv=' + vv.toString();
        }
        v = v + p;
        if (Math.abs(v) > maxVSoFar) {
            if (Math.abs(v) > maxV + 99) {
                error('warning: |v|>' + maxV.toString() + '!');
                maxV = Math.abs(v);
            }
            maxVSoFar = Math.abs(v);
        }
        major(s + ' ' + p.toString() + st);
    }
    function changeFont(fontNum) {
        curDviFont = dviFontMap.get(fontNum);
        if (!curDviFont)
            error('invalid font selection: font ' + fontNum.toString() + ' was never defined!');
        let st = '';
        if (pDebugMode) {
            if (!curDviFont) {
                st = st + 'INVALID FONT!';
            }
            else {
                st = st + curDviFont.fontName;
            }
            st = ' current font is ' + st;
        }
        return st;
    }
    if ((o >= fnt_num_0) && (o < fnt_num_0 + 64)) {
        major('fntnum' + p.toString() + changeFont(p));
        return true;
    }
    switch (o) {
        case down1:
        case down1 + 1:
        case down1 + 2:
        case down1 + 3:
            moveDown('down' + (o - down1 + 1).toString(), p);
            return true;
        case y0:
        case y1:
        case y1 + 1:
        case y1 + 2:
        case y1 + 3:
            y = p;
            moveDown('y' + (o - y0).toString(), p);
            return true;
        case z0:
        case z1:
        case z1 + 1:
        case z1 + 2:
        case z1 + 3:
            z = p;
            moveDown('z' + (o - z0).toString(), p);
            return true;
        case fnt1:
        case fnt1 + 1:
        case fnt1 + 2:
        case fnt1 + 3:
            major('fnt' + (o - fnt1 + 1).toString() + ' ' + p.toString() + changeFont(p));
            return true;
        case fnt_def1:
        case fnt_def1 + 1:
        case fnt_def1 + 2:
        case fnt_def1 + 3:
            major('fntdef' + (o - fnt_def1 + 1).toString() + ' ' + p.toString());
            fontPromises.push(defineFont(p));
            return true;
        case xxx1:
        case xxx1 + 1:
        case xxx1 + 2:
        case xxx1 + 3:
            {
                let mj = 'xxx \'';
                badChar = false;
                if (p < 0)
                    error('string of negative length!');
                for (k = 1; k <= p; k++) {
                    q = getByte();
                    if ((q < 0o40) || (q > 0o176))
                        badChar = true;
                    mj = mj + String.fromCodePoint(q);
                }
                if (badChar)
                    error('non-ASCII character in xxx command!');
                major(mj + '\'');
                return true;
            }
        case pre:
            error('preamble command within a page!');
            debugLog('!');
            return false;
        case post:
        case post_post:
            error('postamble command within a page!');
            debugLog('!');
            return false;
        default:
            error('undefined command ' + o.toString() + '!');
            return true;
    }
    return true;
}
function doPage() {
    pageCount++;
    outPg = {
        pageFonts: [],
        rules: []
    };
    let o; /* operation code of the current command */
    let p, q; /* parameters of the current command */
    let hhh; /* h, rounded to the nearest pixel */
    let luaGlyph; /* the current glyph in the lua font table */
    let gi; /* the current glyph index */
    let uc; /* the current glyph unicode value(s) */
    function moveRight(q) {
        if ((h > 0) && (q > 0)) {
            if (h > (infinity - q)) {
                error('arithmetic overflow! parameter changed from ' + q.toString() + ' to ' + (infinity - h).toString());
                q = infinity - h;
            }
        }
        if ((h < 0) && (q < 0)) {
            if (-h > (q + infinity)) {
                error('arithmetic overflow! parameter changed from ' + (q).toString() + ' to ' + ((-h) - infinity).toString());
                q = (-h) - infinity;
            }
        }
        hh = Math.round(conv * (h + q));
        /*
          hhh = Math.round(conv*(h+q));
          if (Math.abs(hhh-hh) > maxDrift) {
            if (hhh > hh) {
              hh = hhh - maxDrift;
            } else {
              hh = hhh + maxDrift;
            }
          }
          */
        if (pDebugMode) {
            let st = ' h=' + h.toString();
            if (q >= 0)
                st = st + '+';
            log(st + q.toString() + '=' + (h + q).toString() + ', hh=' + hh.toString());
        }
        h = h + q;
        if (Math.abs(h) > maxHSoFar) {
            if (Math.abs(h) > (maxH + 99)) {
                error('warning: |h|>' + maxH.toString() + '!');
                maxH = Math.abs(h);
            }
            maxHSoFar = Math.abs(h);
        }
    }
    function finSet(gi) {
        if ((gi < curDviFont.fontBc) || (gi > curDviFont.fontEc)) {
            q = invalidWidth;
        }
        else {
            q = curDviFont.width[gi];
        }
        if (q === invalidWidth) {
            let st = '';
            if (!curDviFont) {
                st = st + 'INVALID FONT!';
            }
            else {
                st = st + curDviFont.fontName + '!';
            }
            error('glyph index ' + gi.toString() + ' invalid in font ' + st);
        }
        if (o >= put1)
            return;
        if (q === invalidWidth) {
            q = 0;
        }
        else {
            hh = hh + curDviFont.pixelWidth[gi];
        }
        moveRight(q);
    }
    function finRule() {
        q = signedQuad();
        const width = rulePixels(q);
        const st = ' height ' + p.toString() + ', width ' + q.toString();
        if ((p <= 0) || (q <= 0)) {
            debugLog(st + ' (invisible)');
        }
        else {
            const height = rulePixels(p);
            outPg.rules.push({
                x: hh,
                y: vv - height,
                w: width,
                h: height
            });
            debugLog(st + ' (' + h.toString() + 'x' + w.toString() + ' pixels)');
        }
        if (o === put_rule)
            return;
        hh = hh + w;
        moveRight(q);
    }
    function showState() {
        debugLog('level ' + ss.toString() + ':(h=' + h.toString() + ',v=' + v.toString() + ',w=' + w.toString() + ',x=' + x.toString() + ',y=' + y.toString() + ',z=' + z.toString() + ',hh=' + hh.toString() + ',vv=' + vv.toString() + ')');
    }
    s = 0;
    h = 0;
    v = 0;
    w = 0;
    x = 0;
    y = 0;
    z = 0;
    hh = 0;
    vv = 0; /* initialize the state variables */
    while (true) {
        a = dviDataLoc;
        o = getByte();
        p = firstPar(o);
        if (dviDataLoc >= pDviData.length)
            badDvi('the file ended prematurely');
        translation_loop: while (true) {
            if (o < (set_char_0 + 128)) {
                minor('setchar' + p.toString());
                if (curDviFont.luaGlyphs) {
                    luaGlyph = curDviFont.luaGlyphs.get(p.toString());
                    if (luaGlyph) {
                        uc = luaGlyph.unicode;
                        if (uc) {
                            if (typeof uc === "number") {
                                gi = outUnicode(uc);
                                if (gi)
                                    finSet(gi);
                            }
                            else { /* we have multi-character glyph e.g. a ligature */
                                gi = luaGlyph.index;
                                if (gi) {
                                    log('Multi-character glyph. Lua glyph index = ' + gi.toString());
                                    if (gi <= curDviFont.fontEc)
                                        outGlyphIndex(gi);
                                    else
                                        outGlyphIndex(notDefGlyph);
                                    finSet(gi);
                                }
                            }
                        }
                        else { /* we have a non-unicode glyph */
                            gi = luaGlyph.index;
                            if (gi) {
                                log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
                                if (gi <= curDviFont.fontEc)
                                    outGlyphIndex(gi);
                                else
                                    outGlyphIndex(notDefGlyph);
                                finSet(gi);
                            }
                        }
                    }
                }
                break translation_loop;
            }
            else
                switch (o) {
                    case set1:
                        major('set' + (o - set1 + 1).toString() + ' ' + p.toString());
                        if (curDviFont.luaGlyphs) {
                            luaGlyph = curDviFont.luaGlyphs.get(p.toString());
                            if (luaGlyph) {
                                uc = luaGlyph.unicode;
                                if (uc) {
                                    if (typeof uc === "number") {
                                        gi = outUnicode(uc);
                                        if (gi)
                                            finSet(gi);
                                    }
                                    else { /* we have multi-character glyph e.g. a ligature */
                                        gi = luaGlyph.index;
                                        if (gi) {
                                            log('Multi-character glyph. Lua glyph index = ' + gi.toString());
                                            if (gi <= curDviFont.fontEc)
                                                outGlyphIndex(gi);
                                            else
                                                outGlyphIndex(notDefGlyph);
                                            finSet(gi);
                                        }
                                    }
                                }
                                else { /* we have a non-unicode glyph */
                                    gi = luaGlyph.index;
                                    if (gi) {
                                        log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
                                        if (gi <= curDviFont.fontEc)
                                            outGlyphIndex(gi);
                                        else
                                            outGlyphIndex(notDefGlyph);
                                        finSet(gi);
                                    }
                                }
                            }
                        }
                        break translation_loop;
                    case set1 + 1:
                        major('set' + (o - set1 + 1).toString() + ' ' + p.toString());
                        if (curDviFont.luaGlyphs) {
                            luaGlyph = curDviFont.luaGlyphs.get(p.toString());
                            if (luaGlyph) {
                                uc = luaGlyph.unicode;
                                if (uc) {
                                    if (typeof uc === "number") {
                                        gi = outUnicode(uc);
                                        if (gi)
                                            finSet(gi);
                                    }
                                    else { /* we have multi-character glyph e.g. a ligature */
                                        gi = luaGlyph.index;
                                        if (gi) {
                                            log('Multi-character glyph. Lua glyph index = ' + gi.toString());
                                            if (gi <= curDviFont.fontEc)
                                                outGlyphIndex(gi);
                                            else
                                                outGlyphIndex(notDefGlyph);
                                            finSet(gi);
                                        }
                                    }
                                }
                                else { /* we have a non-unicode glyph */
                                    gi = luaGlyph.index;
                                    if (gi) {
                                        log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
                                        if (gi <= curDviFont.fontEc)
                                            outGlyphIndex(gi);
                                        else
                                            outGlyphIndex(notDefGlyph);
                                        finSet(gi);
                                    }
                                }
                            }
                        }
                        break translation_loop;
                    case set1 + 2:
                        major('set' + (o - set1 + 1).toString() + ' ' + p.toString());
                        if (curDviFont.luaGlyphs) {
                            luaGlyph = curDviFont.luaGlyphs.get(p.toString());
                            if (luaGlyph) {
                                uc = luaGlyph.unicode;
                                if (uc) {
                                    if (typeof uc === "number") {
                                        gi = outUnicode(uc);
                                        if (gi)
                                            finSet(gi);
                                    }
                                    else { /* we have multi-character glyph e.g. a ligature */
                                        gi = luaGlyph.index;
                                        if (gi) {
                                            log('Multi-character glyph. Lua glyph index = ' + gi.toString());
                                            if (gi <= curDviFont.fontEc)
                                                outGlyphIndex(gi);
                                            else
                                                outGlyphIndex(notDefGlyph);
                                            finSet(gi);
                                        }
                                    }
                                }
                                else { /* we have a non-unicode glyph */
                                    gi = luaGlyph.index;
                                    if (gi) {
                                        log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
                                        if (gi <= curDviFont.fontEc)
                                            outGlyphIndex(gi);
                                        else
                                            outGlyphIndex(notDefGlyph);
                                        finSet(gi);
                                    }
                                }
                            }
                        }
                        break translation_loop;
                    case set1 + 3:
                        major('set' + (o - set1 + 1).toString() + ' ' + p.toString());
                        if (curDviFont.luaGlyphs) {
                            luaGlyph = curDviFont.luaGlyphs.get(p.toString());
                            if (luaGlyph) {
                                uc = luaGlyph.unicode;
                                if (uc) {
                                    if (typeof uc === "number") {
                                        gi = outUnicode(uc);
                                        if (gi)
                                            finSet(gi);
                                    }
                                    else { /* we have multi-character glyph e.g. a ligature */
                                        gi = luaGlyph.index;
                                        if (gi) {
                                            log('Multi-character glyph. Lua glyph index = ' + gi.toString());
                                            if (gi <= curDviFont.fontEc)
                                                outGlyphIndex(gi);
                                            else
                                                outGlyphIndex(notDefGlyph);
                                            finSet(gi);
                                        }
                                    }
                                }
                                else { /* we have a non-unicode glyph */
                                    gi = luaGlyph.index;
                                    if (gi) {
                                        log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
                                        if (gi <= curDviFont.fontEc)
                                            outGlyphIndex(gi);
                                        else
                                            outGlyphIndex(notDefGlyph);
                                        finSet(gi);
                                    }
                                }
                            }
                        }
                        break translation_loop;
                    case put1:
                        major('put' + (o - put1 + 1).toString() + ' ' + p.toString());
                        if (curDviFont.luaGlyphs) {
                            luaGlyph = curDviFont.luaGlyphs.get(p.toString());
                            if (luaGlyph) {
                                uc = luaGlyph.unicode;
                                if (uc) {
                                    if (typeof uc === "number") {
                                        gi = outUnicode(uc);
                                        if (gi)
                                            finSet(gi);
                                    }
                                    else { /* we have multi-character glyph e.g. a ligature */
                                        gi = luaGlyph.index;
                                        if (gi) {
                                            log('Multi-character glyph. Lua glyph index = ' + gi.toString());
                                            if (gi <= curDviFont.fontEc)
                                                outGlyphIndex(gi);
                                            else
                                                outGlyphIndex(notDefGlyph);
                                            finSet(gi);
                                        }
                                    }
                                }
                                else { /* we have a non-unicode glyph */
                                    gi = luaGlyph.index;
                                    if (gi) {
                                        log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
                                        if (gi <= curDviFont.fontEc)
                                            outGlyphIndex(gi);
                                        else
                                            outGlyphIndex(notDefGlyph);
                                        finSet(gi);
                                    }
                                }
                            }
                        }
                        break translation_loop;
                    case put1 + 1:
                        major('put' + (o - put1 + 1).toString() + ' ' + p.toString());
                        if (curDviFont.luaGlyphs) {
                            luaGlyph = curDviFont.luaGlyphs.get(p.toString());
                            if (luaGlyph) {
                                uc = luaGlyph.unicode;
                                if (uc) {
                                    if (typeof uc === "number") {
                                        gi = outUnicode(uc);
                                        if (gi)
                                            finSet(gi);
                                    }
                                    else { /* we have multi-character glyph e.g. a ligature */
                                        gi = luaGlyph.index;
                                        if (gi) {
                                            log('Multi-character glyph. Lua glyph index = ' + gi.toString());
                                            if (gi <= curDviFont.fontEc)
                                                outGlyphIndex(gi);
                                            else
                                                outGlyphIndex(notDefGlyph);
                                            finSet(gi);
                                        }
                                    }
                                }
                                else { /* we have a non-unicode glyph */
                                    gi = luaGlyph.index;
                                    if (gi) {
                                        log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
                                        if (gi <= curDviFont.fontEc)
                                            outGlyphIndex(gi);
                                        else
                                            outGlyphIndex(notDefGlyph);
                                        finSet(gi);
                                    }
                                }
                            }
                        }
                        break translation_loop;
                    case put1 + 2:
                        major('put' + (o - put1 + 1).toString() + ' ' + p.toString());
                        if (curDviFont.luaGlyphs) {
                            luaGlyph = curDviFont.luaGlyphs.get(p.toString());
                            if (luaGlyph) {
                                uc = luaGlyph.unicode;
                                if (uc) {
                                    if (typeof uc === "number") {
                                        gi = outUnicode(uc);
                                        if (gi)
                                            finSet(gi);
                                    }
                                    else { /* we have multi-character glyph e.g. a ligature */
                                        gi = luaGlyph.index;
                                        if (gi) {
                                            log('Multi-character glyph. Lua glyph index = ' + gi.toString());
                                            if (gi <= curDviFont.fontEc)
                                                outGlyphIndex(gi);
                                            else
                                                outGlyphIndex(notDefGlyph);
                                            finSet(gi);
                                        }
                                    }
                                }
                                else { /* we have a non-unicode glyph */
                                    gi = luaGlyph.index;
                                    if (gi) {
                                        log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
                                        if (gi <= curDviFont.fontEc)
                                            outGlyphIndex(gi);
                                        else
                                            outGlyphIndex(notDefGlyph);
                                        finSet(gi);
                                    }
                                }
                            }
                        }
                        break translation_loop;
                    case put1 + 3:
                        major('put' + (o - put1 + 1).toString() + ' ' + p.toString());
                        if (curDviFont.luaGlyphs) {
                            luaGlyph = curDviFont.luaGlyphs.get(p.toString());
                            if (luaGlyph) {
                                uc = luaGlyph.unicode;
                                if (uc) {
                                    if (typeof uc === "number") {
                                        gi = outUnicode(uc);
                                        if (gi)
                                            finSet(gi);
                                    }
                                    else { /* we have multi-character glyph e.g. a ligature */
                                        gi = luaGlyph.index;
                                        if (gi) {
                                            log('Multi-character glyph. Lua glyph index = ' + gi.toString());
                                            if (gi <= curDviFont.fontEc)
                                                outGlyphIndex(gi);
                                            else
                                                outGlyphIndex(notDefGlyph);
                                            finSet(gi);
                                        }
                                    }
                                }
                                else { /* we have a non-unicode glyph */
                                    gi = luaGlyph.index;
                                    if (gi) {
                                        log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
                                        if (gi <= curDviFont.fontEc)
                                            outGlyphIndex(gi);
                                        else
                                            outGlyphIndex(notDefGlyph);
                                        finSet(gi);
                                    }
                                }
                            }
                        }
                        break translation_loop;
                    case set_rule:
                        major('setrule');
                        finRule();
                        break translation_loop;
                    case put_rule:
                        major('putrule');
                        finRule();
                        break translation_loop;
                    case nop:
                        minor('nop');
                        return true;
                    case bop:
                        error('bop occurred before eop!');
                        debugLog('!');
                        return false;
                    case eop:
                        major('eop');
                        if (s !== 0)
                            error('stack not empty at end of page (level ' + s.toString() + ')!');
                        debugLog(' ');
                        return true;
                    case push:
                        major('push');
                        if (s === maxSSoFar) {
                            maxSSoFar = s + 1;
                            if (s === maxS)
                                error('deeper than claimed in postamble!');
                            if (s === stackSize) {
                                error('dviDecode capacity exceeded (stack size=' + stackSize.toString() + ')');
                                debugLog('!');
                                return false;
                            }
                        }
                        hStack[s] = h;
                        vStack[s] = v;
                        wStack[s] = w;
                        xStack[s] = x;
                        yStack[s] = y;
                        zStack[s] = z;
                        hhStack[s] = hh;
                        vvStack[s] = vv;
                        s++;
                        ss = s - 1;
                        showState();
                        break translation_loop;
                    case pop:
                        major('pop');
                        if (s === 0) {
                            error('(illegal at level zero)!');
                        }
                        else {
                            s--;
                            hh = hhStack[s];
                            vv = vvStack[s];
                            h = hStack[s];
                            v = vStack[s];
                            w = wStack[s];
                            x = xStack[s];
                            y = yStack[s];
                            z = zStack[s];
                        }
                        ss = s;
                        showState();
                        break translation_loop;
                    case right1:
                    case right1 + 1:
                    case right1 + 2:
                    case right1 + 3:
                        outSpace('right' + (o - right1 + 1).toString(), p);
                        q = p;
                        moveRight(q);
                        break translation_loop;
                    case w0:
                    case w1:
                    case w1 + 1:
                    case w1 + 2:
                    case w1 + 3:
                        w = p;
                        outSpace('w' + (o - w0).toString(), p);
                        q = p;
                        moveRight(q);
                        break translation_loop;
                    case x0:
                    case x1:
                    case x1 + 1:
                    case x1 + 2:
                    case x1 + 3:
                        x = p;
                        outSpace('x' + (o - x0).toString(), p);
                        q = p;
                        moveRight(q);
                        break translation_loop;
                    default:
                        if (specialCases(o, p)) {
                            break translation_loop;
                        }
                        else {
                            debugLog('!');
                            return false;
                        }
                }
        }
    }
}
function debugLog(s) {
    if (pDebugMode)
        log(s);
}
function major(s) {
    flushText();
    debugLog(a.toString() + ': ' + s);
}
function minor(s) {
    debugLog(a.toString() + ': ' + s);
}
function error(s) {
    flushText();
    log(a.toString() + ': ' + s);
}
function outSpace(s, p) {
    if (textBuf.length > lineLength - 2)
        flushText();
    textBuf = textBuf + ' ';
    if (curDviFont && curDviFont.otfFont) {
        const fntSpace = curDviFont.fontSpace;
        if ((p >= fntSpace) || (p <= (-4 * fntSpace))) {
            hh = Math.round(conv * (h + p));
        }
        else {
            hh = hh + Math.round(conv * (p));
        }
        minor(s + ' ' + p.toString());
    }
}
function readPostamble() {
    let k; /* loop index */
    let p, m; /* general purpose registers */
    postLoc = dviDataLoc - 5;
    debugLog('Postamble starts at byte ' + postLoc.toString() + '.');
    if (signedQuad() !== numerator)
        debugLog('numerator doesn\'t match the preamble!');
    if (signedQuad() !== denominator)
        debugLog('denominator doesn\'t match the preamble!');
    if (signedQuad() !== mag) {
        if (pNewMag === 0)
            debugLog('magnification doesn\'t match the preamble!');
    }
    maxV = signedQuad();
    maxH = signedQuad();
    maxS = getTwoBytes();
    totalPages = getTwoBytes();
    debugLog('maxv=' + maxV.toString() + ', maxh=' + maxH.toString() + ', maxstackdepth=' + maxS.toString() + ', totalpages=' + totalPages.toString());
    if (pDebugMode)
        if (maxV + 99 < maxVSoFar)
            debugLog('warning: observed maxv was ' + maxVSoFar.toString());
    if (maxH + 99 < maxHSoFar)
        debugLog('warning: observed maxh was ' + maxHSoFar.toString());
    if (maxS < maxSSoFar)
        debugLog('warning: observed maxstackdepth was ' + maxSSoFar.toString());
    do {
        k = getByte();
        if ((k >= fnt_def1) && (k < fnt_def1 + 4)) {
            p = firstPar(k);
            fontPromises.push(defineFont(p));
            debugLog(' ');
            k = nop;
        }
    } while (k === nop);
    if (k !== post_post)
        debugLog('byte ' + (dviDataLoc - 1).toString() + ' is not postpost!');
    const q = signedQuad();
    if (q !== postLoc)
        debugLog('bad postamble pointer in byte ' + (dviDataLoc - 4).toString() + '!');
    m = getByte();
    if (m !== idByte)
        debugLog('identification in byte ' + (dviDataLoc - 1).toString() + ' should be ' + idByte.toString() + '!');
    k = dviDataLoc;
    m = 223;
    while ((m === 223) && (dviDataLoc < pDviData.length))
        m = getByte();
    if (dviDataLoc < pDviData.length) {
        badDvi('signature in byte ' + (dviDataLoc - 1).toString() + ' should be 223');
    }
    else {
        if (dviDataLoc < k + 4)
            debugLog('not enough signature bytes at end of file (' + (dviDataLoc - k).toString() + ')');
    }
}
//# sourceMappingURL=dvi-decode.js.map