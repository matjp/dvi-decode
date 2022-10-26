@*
@c
@<Copyright notice@>
@<Includes@>
@<Type declarations@>
@<Module constants@>
@<Module variables@>

@ 
@<Copyright notice@>=
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

@ 
@<Module const...@>=
const banner = "This is dvi-decode, Version 0.1";

@ 
@<Module var...@>=
let pDviData: Uint8Array;
let pLuaFontPath : string;
let pDisplayDPI: number;
let k: number, m: number, n: number, p: number, q: number; /* general purpose registers */
let firstPass: boolean;
let fontPromises: Promise<void>[];
let outDoc: OutDocument;

@ 
@<Includes@>=
import opentype from 'opentype.js';
import { load, Font, Glyph } from 'opentype.js';

@ 
@<Includes@>=
import { isBrowser, isNode } from 'browser-or-node';

@ 
@<First pass - read the font information@>=
firstPass = true;
@<Reset counters@>    
@<Find the postamble, working back from the end@>
inPostamble = true;
readPostamble();
inPostamble = false;
firstPass = false;    

@ 
@<Second pass - decode layout instructions@>=
@<Reset counters@>
dviDataLoc = afterPre;
@<Scan for bop or postamble@>
pageCount = 0;
@<Translate pages@>
@<Consolidate the fonts...@>

@ 
@c
export async function dviDecode(
  dviData: Uint8Array,
  displayDPI: number, 
  magnification: number,
  fontMap: Map<string,string>,
  luaFontPath: string,
  debugMode?: boolean,
  logFunc?: (msg: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {    
    @<Get log function@>
    @<Set initial values@>
    try {
      @<Read the input parameters@>
      log(banner);
      @<Print all the selected options@>
      @<Process the preamble@>    
      @<First pass - read the font information@>
      Promise.all(fontPromises)
        .then(() => {
          @<Second pass - decode layout instructions@>
          resolve(JSON.stringify(outDoc));
        })       
        .catch((e) => { reject(e.toString()) });           
    } catch (e) {
      if (e instanceof Error)
        reject('!Error ' + e.name + ': ' + e.message);
    }
  });
}

@ 
@<Module var...@>=
let log: (msg: string) => void;

@ 
@<Get log function@>=
log = logFunc ? logFunc : console.log;

@ 
@<Read the input parameters@>=
  pDviData = dviData;
  if (pDviData === null || undefined) throw '!No DVI input provided.';
  pDisplayDPI = displayDPI === (null || undefined) ? 96 : displayDPI;
  pNewMag = magnification === (null || undefined) ? 0 : magnification;
  pLuaFontPath = luaFontPath  === (null || undefined) ? '' : luaFontPath.endsWith('/') ? luaFontPath : luaFontPath + '/';
  pFontMap = fontMap;
  pDebugMode = debugMode === (null || undefined)  ? false : debugMode;

@ 
@<Module const...@>=
const lineLength = 79; /* bracketed lines of output will be at most this long */
const stackSize = 100; /* DVI files shouldn't push beyond this depth */

@ 
@c
function abort(s: string) {
  throw new Error(s);
}

@ 
@c
function badDvi(s: string) {
  abort('Bad DVI file: ' + s + '!');
}

@ 
@<Module const...@>=
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

@ 
@<Module const...@>=
const idByte = 2 /* identifies the kind of DVI files described here */

@ 
@<Module var...@>=
let dviDataLoc = 0; /* where we are about to look, in pDviData */

@ 
@c
function getByte(): number { /* returns the next byte, unsigned */
  if (dviDataLoc >= pDviData.length) {
    return 0
  } else {
    return pDviData[dviDataLoc++];
  }
}

function signedByte(): number { /* returns the next byte, signed */
  const b = pDviData[dviDataLoc++];
  if (b < 128) {
    return b;
  } else {
    return b-256;
  }
}

function getTwoBytes(): number { /* returns the next two bytes, unsigned */
  const a = pDviData[dviDataLoc++];
  const b = pDviData[dviDataLoc++];
  return a*256+b;
}

function signedPair(): number { /* returns the next two bytes, signed */
  const a = pDviData[dviDataLoc++];
  const b = pDviData[dviDataLoc++];
  if (a < 128) {
    return a*256+b;
  } else {
    return (a-256)*256+b;
  }
}

function getThreeBytes(): number { /* returns the next three bytes, unsigned */
  const a = pDviData[dviDataLoc++];
  const b = pDviData[dviDataLoc++];
  const c = pDviData[dviDataLoc++];
  return (a*256+b)*256+c;
}

function signedTrio(): number { /* returns the next three bytes, signed */
  const a = pDviData[dviDataLoc++];
  const b = pDviData[dviDataLoc++];
  const c = pDviData[dviDataLoc++];
  if (a < 128) {
    return (a*256+b)*256+c;
  } else {
    return ((a-256)*256+b)*256+c;
  }
}

function signedQuad(): number { /* returns the next four bytes, signed */
  const a = pDviData[dviDataLoc++];
  const b = pDviData[dviDataLoc++];
  const c = pDviData[dviDataLoc++];
  const d = pDviData[dviDataLoc++];  
  if (a < 128) {
    return ((a*256+b)*256+c)*256+d;
  } else {
    return (((a-256)*256+b)*256+c)*256+d;
  }
}

@ 
@<Type...@>=
type DviFont = {
  fontNum: number; /* external font number */
  fontName: string; /* external font name */
  fontPath: string; /* external font path */
  fontFeatures: string; /* the option string that was attached to the font name */
  fontCheckSum: number; /* check sum */
  fontScaledSize: number; /* scale factor */
  fontDesignSize: number; /* design size */
  fontScaledPointSize: number; /* the point sized (scaled) */
  fontScaledPixelSize: number; /* the font size in pixels */
  fontOtfUnitsPerEm: number; /* OTF Units per Em from the OTF font header */
  fontOtfUnitConv: number; /* the calculated DVI units per OTF unit */
  fontSpace: number; /* boundary between "small" and "large" space */
  fontBc: number; /* beginning character in font */
  fontEc: number; /* ending character in font */
  width: number[]; /* character widths, in DVI units */
  pixelWidth: number[]; /* actual character widths, in pixels */
  otfFont: Font | undefined; /* file handle of the corresponding OTF Font */
  luaGlyphs: Map<string, LuaGlyph> | undefined; 
};

@ 
@<Module const...@>=
const infinity = 0o17777777777; /* (approximately) */
const invalidWidth = infinity;

@ 
@<Module var...@>=
let pFontMap: Map<string,string> | undefined; /* map of external font file names to paths */
let dviFontMap = new Map(); /* the collection of all dvi fonts */

@ 
@<Module var...@>=
//let fntCheckSum: number; /* check sum found in the font file - currently disabled since font checksum is not exposed in opentype.js api */
let fntConv: number; /* DVI units per absolute font unit */

@ 
@c
function inputFont(dviFont: DviFont, otfFont: Font): boolean { /* input font data or return false */
  let k: number; /* index for loops */
  @<Read the header data@>
  @<Load the character widths, converted to dvi units@>
  @<Convert the width values to pixels@>
  dviFont.fontBc = bc;
  dviFont.fontEc = ec;
  return true;
}

@ 
@<Read the header...@>=
const headTable = otfFont.tables['head'];
//fntCheckSum = headTable.checksum;
dviFont.fontOtfUnitsPerEm = headTable.unitsPerEm;
const charCount = otfFont.glyphs.length;
const bc = 0;
const ec = charCount - 1;

@ 
@<Load the character widths...@>=
if (charCount > 0) {
  let pixelsPerEm = (dviFont.fontScaledPointSize * pDisplayDPI) / 72.27;
  let dviUnitPerEm = (1 / conv) * pixelsPerEm;
  dviFont.fontOtfUnitConv = (1 / dviFont.fontOtfUnitsPerEm) * dviUnitPerEm;
  let glyph: Glyph;
  let gw: number | undefined;
  for (k = 0; k < charCount; k++) {
    glyph = otfFont.glyphs.get(k);
    gw = glyph.advanceWidth;
    if (gw)
      dviFont.width.push(Math.round(gw * dviFont.fontOtfUnitConv));
    else
      dviFont.width.push(0);
  }
}

@ 
@<Convert the width values to pixels@>=
if (charCount > 0) {
  for (k = 0; k < charCount; k++) {
    if (dviFont.width[k] === 0) {
      dviFont.pixelWidth.push(0);
    } else {
      dviFont.pixelWidth.push(Math.round(conv * dviFont.width[k]));
    }
  }
}

@ 
@<Module var...@>=
let pDebugMode: boolean /* logs informational messages using the log function */
let pNewMag: number; /* if positive, overrides the postamble's magnification */

@ 
@<Module var...@>=
let startCount: number[]; /* count values to select starting page */
let startThere: boolean[]; /* is the startCount value relevant? */
let startVals: number; /* the last count considered significant */
const count: number[] = []; /* the count values on the current page */

@ 
@c
function startMatch(): boolean { /* does count match the starting spec? */
  let match = true; /* does everything match so far? */
  for (k = 0; k <= startVals; k++) {
    if (startThere[k] && (startCount[k] !== count[k])) match = false;
  }
  return match;
}

@ 
@<Print all the selected options@>=
log('Options selected:');
let sp = '';
for (let k = 0; k <= startVals; k++) {
  if (startThere[k]) {
    sp = sp + startCount[k].toString();
   } else {
    sp = sp + '*';
   }
  if (k < startVals) {
    sp = sp + '.';
  } else {
    sp = sp + ' ';
  }
}
const om = pDebugMode ? 'ON' : 'OFF'
log('  Debug mode is ' + om);
log('  Starting page = ' + sp);
log('  Resolution = ' + pDisplayDPI.toString() + ' pixels per inch');
if (pNewMag > 0) log('  New magnification factor = ' + (pNewMag / 1000).toString() + 'x');

@ 
@<Module var...@>=
let inPostamble: boolean; /* are we reading the postamble */

@ 
@c
async function defineFont(e: number) { /* e is an external font number */
  let d: number, m: number; /* design size, magnification */
  let dviFont: DviFont; /* the font being defined */
  let otfFont: Font;
  let st = '';
  let curDviFontFile = ''; /* external font file name */
  try {
    @<Read the font parameters for new font, and print the font name@>
    dviFont = dviFontMap.get(e);
    if (dviFont) {
      debugLog(st + '---this font was already defined.');
      @<Check that the current font definition matches the old one@>    
    } else { /* add a new font definition */
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
        fontSpace: Math.floor(q / 6), /* this is a 3-unit "thin space" */
        fontBc: 0,
        fontEc: 0,
        width: [],
        pixelWidth: [],
        otfFont: undefined,
        luaGlyphs: new Map()
      };
      @<Load the new font, unless there are problems@>
      dviFont.otfFont = otfFont;
      dviFontMap.set(e, dviFont);
    }
  } catch(err) {
    log('!defineFont failed for font number ' + e.toString());
    throw err;
  }
}

@ 
@<Check that the current font definition matches the old one@>=
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

@ 
@<Read the font parameters...@>=
let curDviFontName = '';
let curDviFontPath = '';
let curDviFontFeatures = '';
const c = signedQuad(); /* checksum */
const q = signedQuad(); /* scaled size */
d = signedQuad();
if ((q <= 0) || (d <= 0)) {
  m = 1000;
} else {
  m = Math.round((1000.0 * conv * q) / (trueConv * d));
}
const p = getByte(); /* length of the directory spec */
const n = getByte(); /* length of the font name proper */
st = st + 'Font ' + e.toString() + ': ';
if ((n + p) === 0) {
  debugLog('null font name!');
} else {
  let cc: number;
  for (k = 0; k < (n + p); k++) {
    cc = getByte();
    if ((cc !== 0o133) && (cc !== 0o135))
      curDviFontName = curDviFontName + String.fromCodePoint(cc);
    }
  let words = curDviFontName.split(':');
  const leftSide = words[0]; const rightSide = (words.length > 1) ? words[1] : '';
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

@ 
@<Type...@>=
type LuaGlyph = {
  index: number | undefined;
  unicode: number | number[] | undefined; /* could be a number or an array of numbers making up a ligature */
}

@ 
@<Load the new font, unless there are problems@>=
{
  otfFont = await opentype.load(curDviFontFile);
  @<Load the lua font table@>
  debugLog('Font ' + e.toString() + ': file ' + curDviFontFile + ' opened:');
  if ((q <= 0) || (q >= 0o1000000000)) {
    debugLog('---not loaded, bad scale (' + q.toString() + ')!');
  } else {
    if ((d <= 0) || (d >= 0o1000000000)) {
      debugLog('---not loaded, bad design size (' + d.toString() + ')!');
    } else {
      if (inputFont(dviFont, otfFont))
        @<Finish loading the new font info@>
    }
  }
}

@ 
@<Includes@>=
import { parse } from 'lua-json';

@ 
@<Load the lua font table@>=
const luaFontFileName = curDviFontName.split('.')[0].toLowerCase();
if (isBrowser) {
  await fetch(pLuaFontPath + luaFontFileName + '.lua').then((response) => response.text())
    .then((text: string) => @<Process the lua font table@> )
} else if (isNode) {
  const fsPromises = await import(/* webpackIgnore: true */ 'fs/promises');
  await fsPromises.readFile(pLuaFontPath + luaFontFileName + '.lua').then((data: any) => data.toString())
    .then((text: string) => @<Process the lua font table@> );
}

@ 
@<Process the lua font table@>=
{
  const fontTableJSON = parse(text);
  const fontTableMap = new Map(Object.entries(fontTableJSON));
  const luaFontMap = new Map(Object.entries(fontTableMap.get("descriptions")));
  luaFontMap.forEach((value: any, key: string) => {
    let idx;
    let uc;
    for (const [k, v] of Object.entries(value)) {
      if (k === 'index') idx = v as number;
      if (k === 'unicode') {
        if (Number.parseInt(v as string) === NaN)
          uc = v as Array<number>
        else
          uc = v as number;
      }
    }
    if (dviFont.luaGlyphs)
      dviFont.luaGlyphs.set(key, {
        index: idx,
        unicode: uc
      });
  });
}

@ 
@<Finish loading...@>=
{
  /*
  if ((c !== 0) && (fntCheckSum !== 0) && (c !== fntCheckSum)) {
    debugLog('---beware: check sums do not agree!');
    debugLog('   (' + c.toString() + ' vs. ' + fntCheckSum.toString() + ')');
    debugLog('   ');
  }
  */
  debugLog('---loaded at size ' + q.toString() + ' DVI units');
  debugLog('---point size (scaled) is ' + dviFont.fontScaledPointSize.toString() + 'pt');
  d = Math.round((100.0*conv*q)/(trueConv*d));
  if (d !== 100) {
    debugLog(' (this font is magnified ' + d.toString() + '%)');
    debugLog('   ');
  }
}

@ 
@<Type...@>=
type OutDocument = {
  fonts: OutFont[];
  pages: OutPage[];
}

type OutFont = {
  fontNum: number;
  fontName: string;
  fontPath: string;
  fontFeatures: string;
}

type OutPage = {
  pageFonts: PageFont[];
  rules: OutRule[];
}

type PageFont = {
  fontNum: number;
  glyphs: OutGlyph[];
}

type OutGlyph = {
  glyphIndex: number;
  glyphSizes: GlyphSize[];
}

type GlyphSize = {
  sz: number; /* the pixel size of the glyph on the page  */
  glyphPlacements: GlyphPlacement[];
}

type GlyphPlacement = {
  x: number; /* the x-coordinate of the glyph on the page */
  y: number; /* the y-coordinate of the glyph on the page  */
}

type OutRule = {
  x: number; /* the x-coordinate of the start of the rule */
  y: number; /* the y-coordinate of the start of the rule */
  w: number; /* the width of the rule (can be negative) */
  h: number; /* the height of the rule (can be negative) */
}

@ 
@<Consolidate the fonts in outDoc@>=
const uniqueFontNames: string[] = [];
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
  fontMap.set(dviFont.fontNum, uniqueFontNames.indexOf(dviFont.fontName))
});

outDoc.pages.forEach(page => {
  /* Replace the font number with the consolidated font number */
  page.pageFonts.forEach(pageFont => {
    pageFont.fontNum = fontMap.get(pageFont.fontNum);
  });

  /* We may now have duplicate page fonts, which can be merged */
  let newPageFonts: PageFont[] = [];
  page.pageFonts.forEach(pageFont => {
    const fontIndex = newPageFonts.findIndex(pf => pf.fontNum === pageFont.fontNum);
    if (fontIndex > -1) {
      newPageFonts[fontIndex].glyphs = newPageFonts[fontIndex].glyphs.concat(pageFont.glyphs);
    } else {
      newPageFonts.push(pageFont);
    }
  });
  page.pageFonts = newPageFonts.sort((f1, f2) => f1.fontNum - f2.fontNum);

  /* And we may then have duplicate glyph entries, which can also be merged */
  page.pageFonts.forEach(pageFont => {
    let newFontGlyphs: OutGlyph[] = [];
    pageFont.glyphs.forEach(glyph => {
    const glyphIndex = newFontGlyphs.findIndex(g => g.glyphIndex === glyph.glyphIndex)
    if (glyphIndex > -1)
      newFontGlyphs[glyphIndex].glyphSizes = newFontGlyphs[glyphIndex].glyphSizes.concat(glyph.glyphSizes);
    else
      newFontGlyphs.push(glyph);
    });
    pageFont.glyphs = newFontGlyphs.sort((g1, g2) => g1.glyphIndex - g2.glyphIndex);
  });

});

@ 
@<Module var...@>=
let textBuf: string; /* saved characters */

@ 
@c
function flushText() {
  if (textBuf !== '') {
    debugLog('[' + textBuf + ']');
    textBuf = '';
  }
}

@ 
@c
function outGlyphIndex(c: number) {
  if (curDviFont && curDviFont.otfFont) { 
    let pageFont: PageFont | undefined = outPg.pageFonts.find(f => f.fontNum === curDviFont.fontNum);
    if (!pageFont) {
      pageFont = {
        fontNum: curDviFont.fontNum,
        glyphs: []
      }
      outPg.pageFonts.push(pageFont);
    }

    let outGlyph: OutGlyph | undefined = pageFont.glyphs.find(g => g.glyphIndex === c);
    if (!outGlyph) {
      outGlyph = {
        glyphIndex: c,
        glyphSizes: []
      }
      pageFont.glyphs.push(outGlyph);
    }

    let glyphSize: GlyphSize | undefined = outGlyph.glyphSizes.find(gs => gs.sz === curDviFont.fontScaledPixelSize);
    if (!glyphSize) {
      glyphSize = {
        sz: curDviFont.fontScaledPixelSize,
        glyphPlacements: []
      }
      outGlyph.glyphSizes.push(glyphSize);
    }

    glyphSize.glyphPlacements.push({ x: hh, y: vv });
  }
}

@ 
@c
function outUnicode(u: number): number | undefined { // returns the glyph index if found
  if (textBuf.length > lineLength - 2) flushText();
  //const v = u ? u as number : 46 // log a '.' character if there is no unicode value for the glyph
  textBuf = textBuf + String.fromCodePoint(u);
  if (curDviFont && curDviFont.otfFont) {
    const cmap = curDviFont.otfFont.tables.cmap;
    const gi = curDviFont.otfFont.tables.cmap.glyphIndexMap[u.toString()];
    if (gi) {
      outGlyphIndex(gi);
      return gi;
    } else {
      return undefined;
    }
  }
}

@ 
@<Module var...@>=
let h: number, v: number, w: number, x: number, y: number, z: number, hh: number, vv: number; /* current state values */
let hStack: number[] = [], vStack: number[] = [], wStack: number[] = [], xStack: number[] = [], yStack: number[] = [], zStack: number[] = []; /* pushed down values in DVI units */
let hhStack: number[] = [], vvStack: number[] = []; /* pushed down values in pixels */

@ 
@<Module var...@>=
let maxV: number; /* the value of Math.abs(v) should probably not exceed this */
let maxH: number; /* the value of Math.abs(h) should probably not exceed this */
let maxS: number; /* the stack depth should not exceed this */
let maxVSoFar: number, maxHSoFar: number, maxSSoFar: number; /* the record high levels */
let totalPages: number; /* the stated total number of pages */
let pageCount: number; /* the total number of pages seen so far */

@ 
@<Reset counters@>=
maxVSoFar = 0;
maxHSoFar = 0;
maxSSoFar = 0;
pageCount = 0;

@ 
@<Translate pages@>=
{
  let pg: string;
  while (true) {
    debugLog(' ');
    pg = '';
    for (let k = 0; k <= startVals; k++) {
      pg = pg + count[k].toString();
      if (k < startVals) {
        pg = pg + '.';
      } else {
        pg = pg + ' ';
      }
    }
    debugLog((dviDataLoc-45).toString() + ': beginning of page ' + pg);
    if (!doPage()) badDvi('page ended unexpectedly');
    outDoc.pages.push(outPg);    
    @<Scan for bop or postamble@>
    if (inPostamble) break;
  }
}

@ 
@c
function firstPar(o: number): number {
  if ((o >= set_char_0) && (o < set_char_0+128))
    return o - set_char_0;

  if ((o >= fnt_num_0) && (o < fnt_num_0+64))
    return o - fnt_num_0;

  switch(o) {
    case set1:
    case put1:
    case fnt1:
    case xxx1:
    case fnt_def1:
      return getByte();
    case set1+1:
    case put1+1:
    case fnt1+1:
    case xxx1+1:
    case fnt_def1+1:
      return getTwoBytes();
    case set1+2:
    case put1+2:
    case fnt1+2:
    case xxx1+2:
    case fnt_def1+2:
      return getThreeBytes();
    case right1:
    case w1:
    case x1:
    case down1:
    case y1:
    case z1:
      return signedByte();
    case right1+1:
    case w1+1:
    case x1+1:
    case down1+1:
    case y1+1:
    case z1+1:
      return signedPair();
    case right1+2:
    case w1+2:
    case x1+2:
    case down1+2:
    case y1+2:
    case z1+2:
      return signedTrio();
    case set1+3:
    case set_rule:
    case put1+3:
    case put_rule:
    case right1+3:
    case w1+3:
    case x1+3:
    case down1+3:
    case y1+3:
    case z1+3:
    case fnt1+3:
    case xxx1+3:
    case fnt_def1+3:
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

@ 
@c
function rulePixels(x: number): number {
  const n = Math.trunc(conv * x);
  if (n < (conv * x)) {
    return n + 1;
  } else {
    return n;
  }
}

@ 
@<Module var...@>=
let outPg: OutPage;
let a: number; /* byte number of the current command */
let s: number; /* current stack size */
let ss: number; /* stack size to print */
let curDviFont: DviFont; /* current internal font */

@ 
@c
@<Declare the function called specialCases@>
function doPage(): boolean {
  pageCount++;  
  outPg = {
    pageFonts: [],
    rules: []
  };
  let o: number; /* operation code of the current command */
  let p: number, q: number; /* parameters of the current command */
  let hhh: number; /* h, rounded to the nearest pixel */
  let luaGlyph: LuaGlyph | undefined; /* the current glyph in the lua font table */
  let gi: number | undefined; /* the current glyph index */
  let uc: number | number[] | undefined; /* the current glyph unicode value(s) */
  @<Declare the function moveRight@>
  @<Declare the function finSet@>
  @<Declare the function finRule@>
  @<Declare the function showState@>
  s = 0; h = 0; v = 0; w = 0; x = 0; y = 0; z = 0; hh = 0; vv = 0; /* initialize the state variables */
  while (true) @<Translate the next command in the DVI file@>
}

@ 
@c
function debugLog(s: string) {
  if (pDebugMode) log(s);
}

function major(s: string) {
  flushText();  
  debugLog(a.toString() + ': ' + s);
}

function minor(s: string) {
  debugLog(a.toString() + ': ' + s);
}

function error(s: string) {
  flushText();
  log(a.toString() + ': ' + s);
}

@ 
@<Translate the next command...@>=
{
  a = dviDataLoc;
  o = getByte();
  p = firstPar(o);
  if (dviDataLoc >= pDviData.length) badDvi('the file ended prematurely');
  translation_loop:
    while (true) { @<Start translation of command o@> }
}

@ 
@<Start translation...@>=
if (o < (set_char_0 + 128)) {
  minor('setchar' + p.toString());
  @<Translate a setChar command@>
}
else
  switch(o) { 
    case set1:
      major('set' + (o-set1+1).toString() + ' ' + p.toString());    
      @<Translate a setChar command@>   
    case set1+1:      
      major('set' + (o-set1+1).toString() + ' ' + p.toString());    
      @<Translate a set2 command@>
    case set1+2:
      major('set' + (o-set1+1).toString() + ' ' + p.toString());
      @<Translate a set3 command@>
    case set1+3:
      major('set' + (o-set1+1).toString() + ' ' + p.toString());
      @<Translate a set4 command@>
    case put1:
      major('put' + (o-put1+1).toString() + ' ' + p.toString());    
      @<Translate a setChar command@>         
    case put1+1:      
      major('put' + (o-put1+1).toString() + ' ' + p.toString());    
      @<Translate a set2 command@>
    case put1+2:
      major('put' + (o-put1+1).toString() + ' ' + p.toString());
      @<Translate a set3 command@>      
    case put1+3:
      major('put' + (o-put1+1).toString() + ' ' + p.toString());
      @<Translate a set4 command@>
    case set_rule:
      major('setrule');
      finRule();
      break translation_loop;
    case put_rule:
      major('putrule');
      finRule();
      break translation_loop;
    @<Cases for commands nop, bop, ..., pop@>
    @<Cases for horizontal motion@>
    default:
      if (specialCases(o,p)) {
        break translation_loop;
      } else {
        debugLog('!');
        return false;
      }
  }

@ 
@<Declare the function called specialCases@>=
function specialCases(o: number, p: number): boolean {
  let q: number; /* parameter of the current command */
  let k: number; /* loop index */
  let badChar: boolean; /* has a non-ASCII character code appeared in this xxx? */
  let vvv: number; /* v, rounded to the nearest pixel */
  @<Declare the function moveDown@>
  @<Declare the function changeFont@>
  if ((o >= fnt_num_0) && (o < fnt_num_0+64)) {
    major('fntnum' + p.toString() + changeFont(p));
    return true;
  }
  switch(o) {
    @<Cases for vertical motion@>
    @<Cases for fonts@>
    case xxx1:
    case xxx1+1:
    case xxx1+2:
    case xxx1+3:
      @<Translate an xxx command and return@>
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

@ 
@<Cases for commands nop, bop, ..., pop@>=
case nop:
  minor('nop');
  return true;
case bop:
  error('bop occurred before eop!');
  debugLog('!');
  return false;
case eop:
  major('eop');
  if (s !== 0) error('stack not empty at end of page (level ' + s.toString() + ')!');
  debugLog(' ');  
  return true;
case push:
  major('push');
  if (s === maxSSoFar) {
    maxSSoFar = s + 1;
    if (s === maxS) error('deeper than claimed in postamble!');
    if (s === stackSize) {
      error('dviDecode capacity exceeded (stack size=' + stackSize.toString() + ')');
      debugLog('!');
      return false;
    }
  }
  hStack[s] = h; vStack[s] = v; wStack[s] = w;
  xStack[s] = x; yStack[s] = y; zStack[s] = z;
  hhStack[s] = hh; vvStack[s] = vv;
  s++;
  ss = s - 1;
  showState();
  break translation_loop;
case pop:
  major('pop');
  if (s === 0) {
    error('(illegal at level zero)!');
  } else {
    s--;
    hh = hhStack[s]; vv = vvStack[s];
    h = hStack[s]; v = vStack[s]; w = wStack[s];
    x= xStack[s]; y = yStack[s]; z = zStack[s];
  }
  ss = s;
  showState();
  break translation_loop;

@ 
@c
function outSpace(s: string, p: number) {
  if (textBuf.length > lineLength - 2) flushText();
  textBuf = textBuf + ' ';
  if (curDviFont && curDviFont.otfFont) {
    const fntSpace = curDviFont.fontSpace;
    if ((p >= fntSpace) || (p <= (-4 * fntSpace))) {
      hh = Math.round(conv * (h + p));
    } else {
      hh = hh + Math.round(conv * (p));
    }
    minor(s + ' ' + p.toString());
  }
}

@ 
@<Cases for horizontal motion@>=
case right1:
case right1+1:
case right1+2:
case right1+3:
  outSpace('right' + (o-right1+1).toString(), p);
  q = p;
  moveRight(q);
  break translation_loop;
case w0:
case w1:
case w1+1:
case w1+2:
case w1+3:
  w = p;
  outSpace('w' + (o-w0).toString(), p);
  q = p;
  moveRight(q);
  break translation_loop;
case x0:
case x1:
case x1+1:
case x1+2:
case x1+3:
  x = p;
  outSpace('x' + (o-x0).toString(), p);
  q = p;
  moveRight(q);
  break translation_loop;

@ 
@<Cases for vertical motion@>=
case down1:
case down1+1:
case down1+2:
case down1+3:
  moveDown('down' + (o-down1+1).toString(), p);
  return true;
case y0:
case y1:
case y1+1:
case y1+2:
case y1+3:
  y = p;
  moveDown('y' + (o-y0).toString(), p);
  return true;
case z0:
case z1:
case z1+1:
case z1+2:
case z1+3:
  z = p;
  moveDown('z' + (o-z0).toString(), p);
  return true;

@ 
@<Cases for fonts@>=
case fnt1:
case fnt1+1:
case fnt1+2:
case fnt1+3:
  major('fnt' + (o-fnt1+1).toString() + ' ' + p.toString() + changeFont(p));
  return true;
case fnt_def1:
case fnt_def1+1:
case fnt_def1+2:
case fnt_def1+3:
  major('fntdef' + (o-fnt_def1+1).toString() + ' ' + p.toString());
  fontPromises.push(defineFont(p));
  return true;

@ 
@<Translate an xxx command and return@>=
{
  let mj = 'xxx \'';
  badChar = false;
  if (p < 0) error('string of negative length!');
  for (k = 1; k <= p; k++) {
    q = getByte();
    if ((q < 0o40) || (q > 0o176)) badChar = true;
    mj = mj + String.fromCodePoint(q);    
  }
  if (badChar) error('non-ASCII character in xxx command!');
  major(mj + '\'');
  return true;
}

@ 
@<Translate a setChar...@>=
@<Translate a character@>

@ 
@<Translate a set2...@>=
@<Translate a character@>

@ 
@<Translate a set3...@>=
@<Translate a character@>

@ 
@<Translate a set4...@>=
@<Translate a character@>

@ 
@<Module const...@>=
const notDefGlyph = 0;

@ 
@<Translate a character@>=
if (curDviFont.luaGlyphs) {
  luaGlyph = curDviFont.luaGlyphs.get(p.toString());
  if (luaGlyph) {
    uc = luaGlyph.unicode;
    if (uc) {
      if (typeof uc === "number") {
        gi = outUnicode(uc);
        if (gi)
          finSet(gi); 
      } else { /* we have multi-character glyph e.g. a ligature */
        gi = luaGlyph.index;
        if (gi) {
          log('Multi-character glyph. Lua glyph index = ' + gi.toString());
          if (gi <= curDviFont.fontEc)
            outGlyphIndex(gi)
          else
            outGlyphIndex(notDefGlyph);
          finSet(gi);          
        }
      }
    } else { /* we have a non-unicode glyph */
      gi = luaGlyph.index;
      if (gi) {
        log('Non-unicode glyph. Lua glyph index = ' + gi.toString());
        if (gi <= curDviFont.fontEc)
          outGlyphIndex(gi)
        else
          outGlyphIndex(notDefGlyph);
        finSet(gi);          
      }
    }
  }
}
break translation_loop;

@ 
@<Declare the function finSet@>=
function finSet(gi: number) {
  if ((gi < curDviFont.fontBc) || (gi > curDviFont.fontEc)) {
    q = invalidWidth;
  } else {
    q = curDviFont.width[gi];
  }
  if (q === invalidWidth) {
    let st = '';
    if (!curDviFont) {
      st = st + 'INVALID FONT!';
    } else {
      st = st + curDviFont.fontName + '!';
    }
    error('glyph index ' + gi.toString() + ' invalid in font ' + st);
  }
  if (o >= put1) return;
  if (q === invalidWidth) {
    q = 0;
  } else {
    hh = hh + curDviFont.pixelWidth[gi];
  }
  moveRight(q);
}

@ 
@<Declare the function finRule@>=
function finRule() {
  q = signedQuad();
  const width = rulePixels(q);
  const st = ' height ' + p.toString() + ', width ' + q.toString();
  if ((p <= 0) || (q <= 0)) {
    debugLog(st + ' (invisible)');
  } else {
    const height = rulePixels(p);
    outPg.rules.push({
      x: hh,
      y: vv - height, /* adjust the bottom left origin of a TeX rule to the top left origin of a Javscript fillRect */
      w: width,
      h: height
    });
    debugLog(st + ' (' + h.toString() + 'x' + w.toString() + ' pixels)');
  }
  if (o === put_rule) return;
  hh = hh + w;
  moveRight(q);
}

@ 
@<Module const...@>=
//const maxDrift = 2 /* we insist that abs(hh-Math.round(conv*(h))) <= maxDrift */

@ 
@<Declare the function moveRight@>=
function moveRight(q: number) {
  if ((h > 0) && (q > 0)) {
    if (h > (infinity - q)) {
      error('arithmetic overflow! parameter changed from ' + q.toString() + ' to ' + (infinity-h).toString());
      q = infinity - h;
    }
  }
  if ((h < 0) && (q < 0)) {
    if (-h > (q + infinity)) {
      error('arithmetic overflow! parameter changed from ' + (q).toString() + ' to ' + ((-h)-infinity).toString());
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
    if (q >= 0) st = st + '+';
    log(st + q.toString() + '=' + (h+q).toString() + ', hh=' + hh.toString());
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

@ 
@<Declare the function moveDown@>=
function moveDown(s: string, p: number) {
  let fntSpace = curDviFont ? curDviFont.fontSpace : 0;
  if (Math.abs(p) >= (5 * fntSpace))
    vv = Math.round(conv * (v + p))
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
      error('arithmetic overflow! parameter changed from ' + p.toString() + ' to ' + ((-v)-infinity).toString());
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
    if (p >= 0) st = st + '+';
    st = st + p.toString() + '=' + (v+p).toString() + ', vv=' + vv.toString();
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

@ 
@<Declare the function showState@>=
function showState() {
  debugLog('level ' + ss.toString() + ':(h=' + h.toString() + ',v=' + v.toString() + ',w=' + w.toString() + ',x=' + x.toString() + ',y=' + y.toString() + ',z=' + z.toString() + ',hh=' + hh.toString() + ',vv=' + vv.toString() + ')');
}

@ 
@<Declare the function changeFont@>=
function changeFont(fontNum: number): string {
  curDviFont = dviFontMap.get(fontNum);
  if (!curDviFont)
    error('invalid font selection: font ' + fontNum.toString() + ' was never defined!');
  let st = '';
  if (pDebugMode) {
    if (!curDviFont) {
      st = st + 'INVALID FONT!';
    } else {
      st = st + curDviFont.fontName;
    }
    st = ' current font is ' + st;
  }
  return st;  
}

@ 
@<Scan for bop or postamble@>=
let cc: number; /* command code */
do {
  if (dviDataLoc >= pDviData.length) badDvi('the file ended prematurely');
  cc = getByte();
  if ((firstPass) && (cc >= fnt_def1) && (cc < fnt_def1 + 4)) {
    fontPromises.push(defineFont(firstPar(k)));
    k = nop;
  }
} while (cc === nop);
if (cc === post) {
  inPostamble = true
} else {
  if (cc !== bop) badDvi('byte ' + (dviDataLoc-1).toString() + ' is not bop');
  newBackpointer = dviDataLoc - 1;
  pageCount++;
  count.length = 0;
  for (let k = 0; k < 10; k++) count.push(signedQuad());
  if (signedQuad() !== oldBackpointer)
    debugLog('backpointer in byte ' + (dviDataLoc-4).toString() + ' should be ' + oldBackpointer.toString() + '!');
  oldBackpointer = newBackpointer;
}

@ 
@<Skip until finding eop@>=
let p: number; /* a parameter */
let downTheDrain: number; /* garbage */
do {
  if (dviDataLoc >= pDviData.length) badDvi('the file ended prematurely');
  cc = getByte();
  p = firstPar(cc);
  switch(cc) {
    case set_rule:
    case put_rule:
      downTheDrain = signedQuad();
      break;
    case fnt_def1:
    case fnt_def1+1:
    case fnt_def1+2:
    case fnt_def1+3:
      fontPromises.push(defineFont(p));
      debugLog(' ');
      break;
    case xxx1:
    case xxx1+1:       
    case xxx1+2:    
    case xxx1+3:    
      while (p > 0) {
        downTheDrain = getByte();
        p--;
      }
      break;
    case bop:
    case pre:
    case post:
    case post_post:
    case undefined_command_1:
    case undefined_command_2:
    case undefined_command_3:
    case undefined_command_4:
    case undefined_command_5:
    case undefined_command_6:
      badDvi('illegal command at byte ' + (dviDataLoc-1).toString());
      break;
    default: /* do nothing */
  }
} while (cc !== eop);

@ 
@<Module var...@>=
let oldBackpointer: number; /* the previous bop command location */
let newBackpointer: number; /* the current |bop| command location */
let started: boolean; /* has the starting page been found? */

@ 
@<Find the postamble, working back from the end@>=
n = pDviData.length;
if (n < 53) badDvi('only ' + n.toString() + ' bytes long');
m = n - 4;
do {
  if (m === 0) badDvi('all 223s');
  dviDataLoc = m;
  k = getByte();
  m--;
} while (k === 223);
if (k !== idByte) badDvi('ID byte is ' + k.toString());
dviDataLoc = m - 3;
q = signedQuad();
if ((q < 0) || (q > m - 33)) badDvi('post pointer ' + q.toString() + ' at byte ' + (m-3).toString());
dviDataLoc = q;
k = getByte();
if (k !== post) badDvi('byte ' + q.toString() + ' is not post');
postLoc = q;
firstBackpointer = signedQuad();

@ 
@<Module var...@>=
let postLoc: number; /* byte location where the postamble begins */
let firstBackpointer: number; /* the pointer following post */
let startLoc: number; /* byte location of the first page to process */
let afterPre: number; /* byte location immediately following the preamble */

@ 
@<Count the pages and move to the starting page@>=
q = postLoc;
p = firstBackpointer;
startLoc = -1;
if (p < 0) {
  inPostamble = true
} else {
  do { /* now q points to a post or bop command; p >= 0 is prev pointer */
    if (p > q - 46) badDvi('page link ' + p.toString() + ' after byte ' + q.toString());
    q = p;
    dviDataLoc = q;
    k = getByte();
    if (k === bop) {
      pageCount++;
     } else {
      badDvi('byte ' + q.toString() + ' is not bop');
     }
    count.length = 0;
    for (k = 0; k < 10; k++) count.push(signedQuad());
    p = signedQuad();
    if (startMatch()) {
      startLoc = q;
      oldBackpointer = p;
    }
  } while (p >= 0);
  if (startLoc < 0) abort('starting page number could not be found!');
  if (oldBackpointer < 0) startLoc = afterPre; /* we want to check everything */
  dviDataLoc = startLoc;
}
if (pageCount !== totalPages)
  debugLog('there are really ' + pageCount.toString() + ' pages, not ' + totalPages.toString() + '!');

@ 
@c
function readPostamble() {
  let k: number; /* loop index */
  let p: number, m: number; /* general purpose registers */
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
  if (pDebugMode) @<Compare the l,u,s,t parameters with the accumulated facts@>
  @<Process the font definitions of the postamble@>
  @<Make sure that the end of the file is well-formed@>
}

@ 
@<Compare the l,u,s,t parameters...@>=
if (maxV + 99 < maxVSoFar)
  debugLog('warning: observed maxv was ' + maxVSoFar.toString());
if (maxH + 99 < maxHSoFar)
  debugLog('warning: observed maxh was ' + maxHSoFar.toString());
if (maxS < maxSSoFar)
  debugLog('warning: observed maxstackdepth was ' + maxSSoFar.toString());

@ 
@<Make sure that the end of the file is well-formed@>=
const q = signedQuad();
if (q !== postLoc)
  debugLog('bad postamble pointer in byte ' + (dviDataLoc-4).toString() + '!');
m = getByte();
if (m !== idByte)
  debugLog('identification in byte ' + (dviDataLoc-1).toString() + ' should be ' + idByte.toString() + '!');
k = dviDataLoc;
m = 223;
while ((m === 223) && (dviDataLoc < pDviData.length)) m = getByte();
if (dviDataLoc < pDviData.length) {
  badDvi('signature in byte ' + (dviDataLoc-1).toString() + ' should be 223');
} else {
  if (dviDataLoc < k + 4)
    debugLog('not enough signature bytes at end of file (' + (dviDataLoc-k).toString() + ')');
}

@ 
@<Process the font definitions...@>=
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
  debugLog('byte ' + (dviDataLoc-1).toString() + ' is not postpost!');

@ 
@<Process the preamble@>=
p = getByte(); /* fetch the first byte */
if (p !== pre) badDvi('First byte isn\'t start of preamble! (' + p.toString(16) + ')');
p = getByte(); /* fetch the identification byte */
if (p !== idByte)
  debugLog('identification in byte 1 should be ' + idByte.toString(16) + '!');
@<Compute the conversion factors@>
p = getByte(); /* fetch the length of the introductory comment */
let comment = '';
while (p > 0) {
  p--;
  comment = comment + String.fromCodePoint(getByte());
}
debugLog('\'' + comment + '\'');
afterPre = dviDataLoc;

@ 
@<Module var...@>=
let conv: number; /* converts DVI units to pixels */
let trueConv: number; /* converts unmagnified DVI units to pixels */
let numerator: number, denominator: number; /* stated conversion ratio */
let mag: number; /* magnification factor times 1000 */

@ 
@<Compute the conversion factors@>=
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
  mag = pNewMag
} else {
  if (mag <= 0) badDvi('magnification is ' + mag.toString());
}
trueConv = conv;
conv = trueConv * (mag / 1000.0);
debugLog('magnification=' + mag.toString() + '; ' + conv.toString() + ' pixels per DVI unit');

@ 
@<Set init...@>=
startVals = 0;
startCount = []; startCount.push(1);
startThere = []; startThere.push(true);
k = 0; m = 0; n = 0; p = 0; q = 0;
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
h = 0; v = 0; w = 0; x = 0; y = 0; z = 0; hh = 0; vv = 0;
hStack = []; vStack = []; wStack = []; xStack = []; yStack = []; zStack = [];
hhStack = []; vvStack = [];
maxV = 0o17777777777 - 99;
maxH = 0o17777777777 - 99;
maxS = stackSize + 1;
maxVSoFar = 0; maxHSoFar = 0; maxSSoFar = 0;
totalPages = 0; pageCount = 0;
a = 0; s = 0; ss = 0;
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

@ 
