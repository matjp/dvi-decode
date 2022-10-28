# `dvi-decode` for LuaTeX

A Javascript module that enables rendering of `LuaTeX` `dvi` files directly to the web-browser.

`dvi-decode` reads a device-independent (`dvi`) file produced by `dvilualatex` and outputs a JSON object containing the glyph ID's used from each font in the document, along with position and size information for each glyph placement on each page of the document. Thus, any `LaTeX` file can be  rendered to a web-browser by drawing the document glyphs to a canvas using a font rendering module such as `OpenType.js`.

`dvi-decode` can run either in browser or with node.js, providing all necessary input files are made available (see Configuration below).

Try my DVI Viewer app to see `dvi-decode` in action: <https://matjp.github.io/dvi-viewer/>

## LaTeX source assumptions

In order for `dvi-decode` to interpret a `LuaTeX` `dvi` file correctly it makes some assumptions about the font settings in the `LaTeX` source file:

1. The fonts used are OpenType or TrueType.
2. The `unicode-math` package is used if math symbols are used.
3. Every font used is explicitly set using a `fontspec` command.
4. Fonts are set using filenames rather than proper names i.e.

    ```latex
    \setmathfont{latinmodern-math.otf}[Renderer=OpenType]
    ```

5. The font option `Renderer=Opentype` has been selected for every font used. This ensures the expected character encodings are produced in the `dvi` file.

Additionally, the `dvi` file must be generated by `LuaTeX` using the `dvilualatex` command.

## The output data structure

`dvi-decode` returns the `Promise` of a JSON object conforming to the schema file `dvi-doc.json`.

## Configuration

`dvi-decode` needs access to the OpenType/TrueType font files specified in the `LaTeX` source, and to the `.lua` font files generated when `dvilualatex` is run.

The file `font.map` lists the OpenType/TrueType font names together with their paths. The full path of this file should be passed as an argument to `dvi-decode`.

The `.lua` font files are normally found in the `LuaTeX` font cache, the location of which should be passed as an argument to `dvi-decode`.

## Running `dvi-decode`

Install the `dvi-decode` package:

```sh
npm i @matjp/dvi-decode
```

Import the `dviDecode` function:

```js
import { dviDecode } from '@matjp/dvi-decode';
```

Call `dviDecode` and handle the returned document `Promise` e.g

```js
dviDecode(dviData, 96, 1000, fontMap, luaFontPath, true).then(doc => {
    console.log(JSON.stringify(JSON.parse(doc), undefined, 2));
});
```

## Arguments to the function `dviDecode`

```js
function dviDecode(
  dviData: Uint8Array,
  displayDPI: number, 
  magnification: number,
  fontMap: Map<string,string>,
  luaFontPath: string,
  debugMode?: boolean,
  logFunc?: (msg: string) => void): Promise<string>
```

`dviData`: The binary data contained in the `dvi` file to be processed, as a `Uint8Array`.

`displayDPI`: Pixels per inch of the target display device.

`magnification`: Percentage magnification required multiplied by 10. e.g. 100% = 1000.

`fontMap`: A `Map` of font file names to paths for all fonts required.

`luaFontPath`: The path to the `.lua` font files.

`debugMode`: Optionally print debug information. Default `false`.

`logFunc`: An optional log function to print messages with. Defaults to `console.log`.

## Example code

See the file `test/test.js` for an example of setting up the arguments and calling `dviDecode`.

The returned document object can be rendered to the browser using the `CanvasRenderingContext2D` interface.

For example, this code will render a single page from document `doc` to the rendering context `ctx` using the `OpenType.js` library:

```js
doc.pages[pageIndex].rules.forEach(
  rule => ctx.fillRect(props.marginPixels + rule.x, rule.y, rule.w, rule.h)
);
doc.pages[pageIndex].pageFonts.forEach(
  async pageFont => {
    const docFont = props.doc.fonts.find(f => f.fontNum === pageFont.fontNum);
    if (docFont) {
      const otfFont = await opentype.load(docFont.fontPath + docFont.fontName);
      if (otfFont) {
        pageFont.glyphs.forEach(glyph => {
          let otfGlyph = otfFont.glyphs.get(glyph.glyphIndex);
          if (otfGlyph)
            glyph.glyphSizes.forEach(glyphSize =>
              glyphSize.glyphPlacements.forEach(glyphPlacement => 
                otfGlyph.draw(ctx, props.marginPixels + glyphPlacement.x,
                  glyphPlacement.y, glyphSize.sz, { features: {hinting: true} }
                )
              )
            );
        });
      }
    }
});
```

## DVI Viewer App

For a full example of decoding and rendering a `dvi` file see the source to my `React` app [DVI Viewer](https://github.com/matjp/dvi-viewer).

## A note about the `dvi-decode` source code

`dvi-decode` is a `JWEB` literate program derived from Donald Knuth's `DVIType` `WEB` program. If you have an interest in understading how `dvi-decode` works, it is recommended that you read the `JWEB` source file `dvi-decode.md` rather than the generated `Javascript` source file.
