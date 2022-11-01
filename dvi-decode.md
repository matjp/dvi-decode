---
jweb:ts
---

## dvi-decode.md

This JWEB program by Matthew J. Penwill is based upon the program `DVItype` by Donald E. Knuth.

## Table of contents

[Introduction](#introduction)  
[Declarations of module scope](#declarations-of-module-scope)  
[The main program](#the-main-program)  
[Configuration](#configuration)  
[Termination](#termination)  
[Device-independent file format](#device-independent-file-format)  
[DVI commands](#dvi-commands)  
[Binary input data](#binary-input-data)  
[Reading the font information](#reading-the-font-information)  
[Optional modes of output](#optional-modes-of-output)  
[Defining fonts](#defining-fonts)  
[The output data structure](#the-output-data-structure)  
[Low level output routines](#low-level-output-routines)  
[Translation to symbolic form](#translation-to-symbolic-form)  
[Skipping pages](#skipping-pages)  
[Using the backpointers](#using-the-backpointers)  
[Reading the postamble](#reading-the-postamble)  
[Reading the preamble](#reading-the-preamble)  
[Initialization of module variables](#initialization-of-module-variables)  

## Introduction

The `dvi-decode` module reads binary device-independent (`dvi`) files that are produced by `dvilualatex` from LaTeX source files. The program outputs a document object containing the glyph ID's used from each font, along with position and size information for each glyph placement on each page of the document. Thus the document can easily be rendered by drawing the font glyphs to some output device.

Programs for typesetting need to be especially careful about how they do arithmetic; if rounding errors accumulate, margins won't be straight, vertical rules won't line up, and so on. But if rounding is done everywhere, even in the midst of words, there will be uneven spacing between the letters, and that looks bad. Human eyes notice differences of a thousandth of an inch in the positioning of lines that are close together; on low resolution devices, where rounding produces effects four times as great as this, the problem is especially critical. Experience has shown that unusual care is needed even on high-resolution equipment; for example, a mistake in the sixth significant hexadecimal place of a constant once led to a difficult-to-find bug in some software for the Alphatype CRS, which has a resolution of 5333 pixels per inch (make that 5333.33333333 pixels per inch).

## Declarations of module scope

```ts
@c
@<Copyright notice@>
@<Includes@>
@<Type declarations@>
@<Module constants@>
@<Module variables@>
```

```ts
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
```

The `banner` string defined here should be changed whenever `dvi-decode` gets modified. It is printed when the program starts.

```ts
@<Module const...@>=
const banner = "This is dvi-decode, Version 0.1";
```

## The main program

The binary input comes from the parameter `dviData` which should be passed a `Uint8Array`.

```ts
@<Module var...@>=
let pDviData: Uint8Array;
let pLuaFontPath : string;
let pDisplayDPI: number;
let k: number, m: number, n: number, p: number, q: number; /* general purpose registers */
let firstPass: boolean;
let fontPromises: Promise<void>[];
let outDoc: OutDocument;
```

We will use the OpenType.js library to load fonts.

```ts
@<Includes@>=
import opentype from 'opentype.js';
import { load, Font, Glyph } from 'opentype.js';
```

```ts
@<Includes@>=
import { isBrowser, isNode } from 'browser-or-node';
```

The DVI input will be processed in two passes. The first pass reads in all of the font information, and the second pass decodes the layout instructions.

```ts
@<First pass - read the font information@>=
firstPass = true;
@<Reset counters@>    
@<Find the postamble, working back from the end@>
inPostamble = true;
readPostamble();
inPostamble = false;
firstPass = false;    
```

```ts
@<Second pass - decode layout instructions@>=
@<Reset counters@>
dviDataLoc = afterPre;
@<Scan for bop or postamble@>
pageCount = 0;
@<Translate pages@>
@<Consolidate the fonts...@>
```

The function named `dviDecode` is the module entry point. It returns a promise of a JSON object of type `OutDocument`.

```ts
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
        .catch((e) => { reject(e.toString())} );
    } catch (e) {
      if (e instanceof Error)
        reject('!Error ' + e.name + ': ' + e.message);
    }
  });
}
```

## Configuration

Determine the logging function to use. If none is passed to `dviDecode` then messages will be written to the console.

```ts
@<Module var...@>=
let log: (msg: string) => void;
```

```ts
@<Get log function@>=
log = logFunc ? logFunc : console.log;
```

A routine to read the parameters passed to the function `dviDecode`.

```ts
@<Read the input parameters@>=
  pDviData = dviData;
  if (pDviData === null || undefined) throw '!No DVI input provided.';
  pDisplayDPI = displayDPI === (null || undefined) ? 96 : displayDPI;
  pNewMag = magnification === (null || undefined) ? 0 : magnification;
  pLuaFontPath = luaFontPath  === (null || undefined) ? '' : luaFontPath.endsWith('/') ? luaFontPath : luaFontPath + '/';
  pFontMap = fontMap;
  pDebugMode = debugMode === (null || undefined)  ? false : debugMode;
```

The following globals can be changed at compile time to extend or reduce `dviDecode`'s capacity.

```ts
@<Module const...@>=
const lineLength = 79; /* bracketed lines of output will be at most this long */
const stackSize = 100; /* DVI files shouldn't push beyond this depth */
```

## Termination

If the DVI source is badly malformed, the whole process must be aborted; `dviDecode` will give up, after issuing an error message about the symptoms that were noticed.

```ts
@c
function abort(s: string) {
  throw new Error(s);
}
```

```ts
@c
function badDvi(s: string) {
  abort('Bad DVI file: ' + s + '!');
}
```

## Device-independent file format

Before we get into the details of `dviDecode`, we need to know exactly what `dvi` files are. The form of such files was designed by David R. Fuchs in 1979. Almost any reasonable typesetting device can be driven by a program that takes `dvi` files as input, and dozens of such `dvi`-to-whatever programs have been written.Thus, it is possible to print the output of document compilers like TeX on many different kinds of equipment.

A `dvi` file is a stream of 8-bit bytes, which may be regarded as a series of commands in a machine-like language. The first byte of each command is the operation code, and this code is followed by zero or more bytes that provide parameters to the command. The parameters themselves may consist of several consecutive bytes; for example, the '$set\_rule$' command has two parameters, each of which is four bytes long. Parameters are usually regarded as nonnegative integers; but four-byte-long parameters, and shorter parameters that denote distances, can be either positive or negative. Such parameters are given in two's complement notation. For example, a two-byte-long distance parameter has a value between $-2^{15}$ and $2^{15}-1$.

A `dvi` file consists of a preamble, followed by a sequence of one or more pages, followed by a postamble. The preamble is simply a $pre$ command, with its parameters that define the dimensions used in the file; this must come first. Each page consists of a $bop$ command, followed by any number of other commands that tell where characters are to be placed on a physical page, followed by an $eop$ command. The pages appear in the order that they were generated, not in any particular numerical order. If we ignore $nop$ commands and $fnt\_def$ commands (which are allowed between any two commands in the file), each $eop$ command is immediately followed by a $bop$ command, or by a $post$ command; in the latter case, there are no more pages in the file, and the remaining bytes form the postamble. Further details about the postamble will be explained later.

Some parameters in `dvi` commands are pointers. These are four-byte quantities that give the location number of some other byte in the file; the first byte is number $0$, then comes number $1$, and so on. For example, one of the parameters of a $bop$ command points to the previous $bop$; this makes it feasible to read the pages in backwards order, in case the results are being directed to a device that stacks its output face up. Suppose the preamble of a `dvi` file occupies bytes $0$ to $99$. Now if the first page occupies bytes $100$ to $999$, say, and if the second page occupies bytes $1000$ to $1999$, then the $bop$ that starts in byte $1000$ points to $100$ and the $bop$ that starts in byte $2000$ points to $1000$. (The very first $bop$, i.e., the one that starts in byte $100$, has a pointer of $-1$.)

The `dvi` format is intended to be both compact and easily interpreted by a machine. Compactness is achieved by making most of the information implicit instead of explicit. When a `dvi`-reading program reads the commands for a page, it keeps track of several quantities: a) The current font $f$ is an integer; this value is changed only by $fnt$ and $fnt\_num$ commands. b) The current position on the page is given by two numbers called the horizontal and vertical coordinates, $h$ and $v$. Both coordinates are zero at the upper left corner of the page; moving to the right corresponds to increasing the horizontal coordinate, and moving down corresponds to increasing the vertical coordinate. Thus, the coordinates are essentially Cartesian, except that vertical directions are flipped; the Cartesian version of $(h,v)$ would be $(h,-v)$. c) The current spacing amounts are given by four numbers $w$, $x$, $y$, and $z$, where $w$ and $x$ are used for horizontal spacing and where $y$ and $z$ are used for vertical spacing. d) There is a stack containing $(h,v,w,x,y,z)$ values; the `dvi` commands $push$ and $pop$ are used to change the current level of operation. Note that the current font $f$ is not pushed and popped; the stack contains only information about positioning.

The values of $h$, $v$, $w$, $x$, $y$, and $z$ are signed integers having up to 32 bits, including the sign. Since they represent physical distances,
there is a small unit of measurement such that increasing $h$ by $1$ means moving a certain tiny distance to the right. The actual unit of measurement is variable, as explained below.

## DVI commands

Here is a list of all the commands that may appear in a `dvi` file. Each command is specified by its symbolic name (e.g., $bop$), its opcode byte (e.g., $139$), and its parameters (if any). The parameters are followed by a bracketed number telling how many bytes they occupy; for example, $p[4]$ means that parameter $p$ is four bytes long.

&emsp;$set\_char\_0$ $0$. Typeset character number $0$ from font $f$ such that the reference point of the character is at $(h,v)$. Then increase $h$ by the width of that character. Note that a character may have zero or negative width, so one cannot be sure that $h$ will advance after this command; but $h$ usually does increase.

&emsp;$set\_char\_1$ through $set\_char\_127$ (opcodes $1$ to $127$). Do the operations of $set\_char\_0$; but use the character whose number matches the opcode, instead of character $0$.

&emsp;$set1$ $128$ $c[1]$. Same as $set\_char\_0$, except that character number $c$ is typeset. $\TeX82$ uses this command for characters in the range $128<=c<256$.

&emsp;$set2$ $129$ $c[2]$. Same as $set1$, except that $c$ is two bytes long, so it is in the range $0<=c<65536$. $\TeX82$ never uses this command, which is intended for processors that deal with oriental languages; but `dviDecode` will allow character codes greater than 255, assuming that they all have the same width as the character whose code is $c \bmod 256$.

&emsp;$set3$ $130$ $c[3]$. Same as $set1$, except that $c$ is three bytes long, so it can be as large as $2^{24}-1$.

&emsp;$set4$ $131$ $c[4]$. Same as $set1$, except that $c$ is four bytes long, possibly even negative. Imagine that.

&emsp;$set\_rule$ $132$ $a[4]$ $b[4]$. Typeset a solid black rectangle of height $a$ and width $b$, with its bottom left corner at $(h,v)$. Then set $h=h+b$. If either $a<=0$ or $b<=0$, nothing should be typeset. Note that if $b<0$, the value of $h$ will decrease even though nothing else happens. Programs that typeset from `dvi` files should be careful to make the rules line up carefully with digitized characters, as explained in connection with the $rule\_pixels$ subroutine below.

&emsp;$put1$ $133$ $c[1]$. Typeset character number $c$ from font $f$ such that the reference point of the character is at $(h,v)$. (The 'put' commands are exactly like the 'set' commands, except that they simply put out a character or a rule without moving the reference point afterwards.)

&emsp;$put2$ $134$ $c[2]$. Same as $set2$, except that $h$ is not changed.

&emsp;$put3$ $135$ $c[3]$. Same as $set3$, except that $h$ is not changed.

&emsp;$put4$ $136$ $c[4]$. Same as $set4$, except that $h$ is not changed.

&emsp;$put\_rule$ $137$ $a[4]$ $b[4]$. Same as $set\_rule$, except that $h$ is not changed.

&emsp;$nop$ $138$. No operation, do nothing. Any number of $nop$'s may occur between `dvi` commands, but a $nop$ cannot be inserted between a command and its parameters or between two parameters.

&emsp;$bop$ $139$ $c_0[4]$ $c_1[4]$ $\ldots$ $c_9[4]$ $p[4]$. Beginning of a page: Set $(h,v,w,x,y,z)=(0,0,0,0,0,0)$ and set the stack empty. Set the current font $f$ to an undefined value. The ten $c_i$ parameters can be used to identify pages, if a user wants to print only part of a `dvi` file; The parameter $p$ points to the previous $bop$ command in the file, where the first $bop$ has $p=-1$.

&emsp;$eop$ $140$. End of page: Print what you have read since the previous $bop$. At this point the stack should be empty. (The `dvi`-reading programs that drive most output devices will have kept a buffer of the material that appears on the page that has just ended. This material is largely, but not entirely, in order by $v$ coordinate and (for fixed $v$) by $h$ coordinate; so it usually needs to be sorted into some order that is appropriate for the device in question. `dviDecode` does not do such sorting.)

&emsp;$push$ $141$. Push the current values of $(h,v,w,x,y,z)$ onto the top of the stack; do not change any of these values. Note that $f$ is not pushed.

&emsp;$pop$ $142$. Pop the top six values off of the stack and assign them to $(h,v,w,x,y,z)$. The number of pops should never exceed the number of pushes, since it would be highly embarrassing if the stack were empty at the time of a $pop$ command.

&emsp;$right1$ $143$ $b[1]$. Set $h=h+b$, i.e., move right $b$ units. The parameter is a signed number in two's complement notation, $-128<=b<128$; if $b<0$, the reference point actually moves left.

&emsp;$right2$ $144$ $b[2]$. Same as $right1$, except that $b$ is a two-byte quantity in the range $-32768<=b<32768$.

&emsp;$right3$ $145$ $b[3]$. Same as $right1$, except that $b$ is a three-byte quantity in the range $-2^{23}<=b<2^{23}$.

&emsp;$right4$ $146$ $b[4]$. Same as $right1$, except that $b$ is a four-byte quantity in the range $-2^{31}<=b<2^{31}$.

&emsp;$w0$ $147$. Set $h=h+w$; i.e., move right $w$ units. With luck, this parameterless command will usually suffice, because the same kind of motion will occur several times in succession; the following commands explain how $w$ gets particular values.

&emsp;$w1$ $148$ $b[1]$. Set $w=b$ and $h=h+b$. The value of $b$ is a signed quantity in two's complement notation, $-128<=b<128$. This command changes the current $w$ spacing and moves right by $b$.

&emsp;$w2$ $149$ $b[2]$. Same as $w1$, but $b$ is a two-byte-long parameter, $-32768<=b<32768$.

&emsp;$w3$ $150$ $b[3]$. Same as $w1$, but $b$ is a three-byte-long parameter, $-2^{23}<=b<2^{23}$.

&emsp;$w4$ $151$ $b[4]$. Same as $w1$, but $b$ is a four-byte-long parameter, $-2^{31}<=b<2^{31}$.

&emsp;$x0$ $152$. Set $h=h+x$; i.e., move right $x$ units. The '$x$' commands are like the '$w$' commands except that they involve $x$ instead of $w$.

&emsp;$x1$ $153$ $b[1]$. Set $x=b$ and $h=h+b$. The value of $b$ is a signed quantity in two's complement notation, $-128<=b<128$. This command changes the current $x$ spacing and moves right by $b$.

&emsp;$x2$ $154$ $b[2]$. Same as $x1$, but $b$ is a two-byte-long parameter, $-32768<=b<32768$.

&emsp;$x3$ $155$ $b[3]$. Same as $x1$, but $b$ is a three-byte-long parameter, $-2^{23}<=b<2^{23}$.

&emsp;$x4$ $156$ $b[4]$. Same as $x1$, but $b$ is a four-byte-long parameter, $-2^{31}<=b<2^{31}$.

&emsp;$down1$ $157$ $a[1]$. Set $v=v+a$, i.e., move down $a$ units. The parameter is a signed number in two's complement notation, $-128<=a<128$; if $a<0$, the reference point actually moves up.

&emsp;$down2$ $158$ $a[2]$. Same as $down1$, except that $a$ is a two-byte quantity in the range $-32768<=a<32768$.

&emsp;$down3$ $159$ $a[3]$. Same as $down1$, except that $a$ is a three-byte quantity in the range $-2^{23}<=a<2^{23}$.

&emsp;$down4$ $160$ $a[4]$. Same as $down1$, except that $a$ is a four-byte quantity in the range $-2^{31}<=a<2^{31}$.

&emsp;$y0$ $161$. Set $v=v+y$; i.e., move down $y$ units. With luck, this parameterless command will usually suffice, because the same kind of motion will occur several times in succession; the following commands explain how $y$ gets particular values.

&emsp;$y1$ $162$ $a[1]$. Set $y=a$ and $v=v+a$. The value of $a$ is a signed quantity in two's complement notation, $-128<=a<128$. This command changes the current $y$ spacing and moves down by $a$.

&emsp;$y2$ $163$ $a[2]$. Same as $y1$, but $a$ is a two-byte-long parameter, $-32768<=a<32768$.

&emsp;$y3$ $164$ $a[3]$. Same as $y1$, but $a$ is a three-byte-long parameter, $-2^{23}<=a<2^{23}$.

&emsp;$y4$ $165$ $a[4]$. Same as $y1$, but $a$ is a four-byte-long parameter, $-2^{31}<=a<2^{31}$.

&emsp;$z0$ $166$. Set $v=v+z$; i.e., move down $z$ units. The '$z$' commands are like the '$y$' commands except that they involve $z$ instead of $y$.

&emsp;$z1$ $167$ $a[1]$. Set $z=a$ and $v=v+a$. The value of $a$ is a signed quantity in two's complement notation, $-128<=a<128$. This command changes the current $z$ spacing and moves down by $a$.

&emsp;$z2$ $168$ $a[2]$. Same as $z1$, but $a$ is a two-byte-long parameter, $-32768<=a<32768$.

&emsp;$z3$ $169$ $a[3]$. Same as $z1$, but $a$ is a three-byte-long parameter, $-2^{23}<=a<2^{23}$.

&emsp;$z4$ $170$ $a[4]$. Same as $z1$, but $a$ is a four-byte-long parameter, $-2^{31}<=a<2^{31}$.

&emsp;$fnt\_num\_0$ $171$. Set $f=0$. Font $0$ must previously have been defined by a $fnt\_def$ instruction, as explained below.

&emsp;$fnt\_num\_1$ through $fnt\_num\_63$ (opcodes $172$ to $234$). Set $f=1$, $\dots$, $f=63$, respectively.

&emsp;$fnt1$ $235$ $k[1]$. Set $f=k$. $\TeX82$ uses this command for font numbers in the range |64<=k<256|.

&emsp;$fnt2$ $236$ $k[2]$. Same as $fnt1$, except that $k$ is two bytes long, so it is in the range $0<=k<65536$. $\TeX82$ never generates this command, but large font numbers may prove useful for specifications of color or texture, or they may be used for special fonts that have fixed numbers in some external coding scheme.

&emsp;$fnt3$ $237$ $k[3]$. Same as $fnt1$, except that $k$ is three bytes long, so it can be as large as $2^{24}-1$.

&emsp;$fnt4$ $238$ $k[4]$. Same as $fnt1$, except that $k$ is four bytes long; this is for the really big font numbers (and for the negative ones).

&emsp;$xxx1$ $239$ $k[1]$ $x[k]$. This command is undefined in general; it functions as a $(k+2)$-byte $nop$ unless special `dvi`-reading programs are being used. $\TeX82$ generates $xxx1$ when a short enough special appears, setting $k$ to the number of bytes being sent. It is recommended that $x$ be a string having the form of a keyword followed by possible parameters relevant to that keyword.

&emsp;$xxx2$ $240$ $k[2]$ $x[k]$. Like $xxx1$, but $0<=k<65536$.

&emsp;$xxx3$ $241$ $k[3]$ $x[k]$. Like $xxx1$, but $0<=k<2^{24}$.

&emsp;$xxx4$ $242$ $k[4]$ $x[k]$. Like $xxx1$, but $k$ can be ridiculously large. $\TeX82$ uses $xxx4$ when $xxx1$ would be incorrect.

&emsp;$fnt\_def1$ $243$ $k[1]$ $c[4]$ $s[4]$ $d[4]$ $a[1]$ $l[1]$ $n[a+l]$. Define font $k$, where $0<=k<256$; font definitions will be explained shortly.

&emsp;$fnt\_def2$ $244$ $k[2]$ $c[4]$ $s[4]$ $d[4]$ $a[1]$ $l[1]$ $n[a+l]$. Define font $k$, where $0<=k<65536$.

&emsp;$fnt\_def3$ $245$ $k[3]$ $c[4]$ $s[4]$ $d[4]$ $a[1]$ $l[1]$ $n[a+l]$. Define font $k$, where $0<=k<2^{24}$.

&emsp;$fnt\_def4$ $246$ $k[4]$ $c[4]$ $s[4]$ $d[4]$ $a[1]$ $l[1]$ $n[a+l]$. Define font $k$, where $-2^{31}<=k<2^{31}$.

&emsp;$pre$ $247$ $i[1]$ $num[4]$ $den[4]$ $mag[4]$ $k[1]$ $x[k]$. Beginning of the preamble; this must come at the very beginning of the file. Parameters $i$, $num$, $den$, $mag$, $k$, and $x$ are explained below.

&emsp;$post$ $248$. Beginning of the postamble, see below.

&emsp;$post\_post$ $249$. Ending of the postamble, see below.

Commands $250-255$ are undefined at the present time.

```ts
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
```

The preamble contains basic information about the file as a whole. As stated above, there are six parameters: $$i[1]{\enspace}num[4]{\enspace}den[4]{\enspace}mag[4]{\enspace}k[1]{\enspace}x[k].$$ The $i$ byte identifies `dvi` format; currently this byte is always set to 2. (The value $i=3$ is currently used for an extended format that allows a mixture of right-to-left and left-to-right typesetting. Some day we will set $i=4$, when `dvi` format makes another incompatible change---perhaps in the year 2048.)

The next two parameters, $num$ and $den$, are positive integers that define the units of measurement; they are the numerator and denominator of a fraction by which all dimensions in the `dvi` file could be multiplied in order to get lengths in units of $10^{-7}$ meters. (For example, there are exactly 7227 $\TeX$ points in 254 centimeters, and $\TeX82$ works with scaled points where there are $2^{16}$ sp in a point, so $\TeX82$ sets $num=25400000$ and $den=7227\cdot2^{16}=473628672$.)

The $mag$ parameter is what $\TeX82$ calls `\mag`, i.e., 1000 times the desired magnification. The actual fraction by which dimensions are multiplied is therefore $mn/1000d$. Note that if a $\TeX$ source document does not call for any '`true`' dimensions, and if you change it only by specifying a different `\mag` setting, the `dvi` file that $\TeX$ creates will be completely unchanged except for the value of $mag$ in the preamble and postamble. (Fancy `dvi`-reading programs allow users to override the $mag$ setting when a `dvi` file is being printed.)

Finally, $k$ and $x$ allow the `dvi` writer to include a comment, which is not interpreted further. The length of comment $x$ is $k$, where $0<=k<256$.

```ts
@<Module const...@>=
const idByte = 2 /* identifies the kind of DVI files described here */
```

Font definitions for a given font number $k$ contain further parameters $$c[4]{\enspace}s[4]{\enspace}d[4]{\enspace}a[1]{\enspace}l[1]{\enspace}n[a+l].$$ The four-byte value $c$ is the check sum that $\TeX$ (or whatever program generated the `dvi` file) found in the font file for this font; $c$ should match the check sum of the font found by programs that read this `dvi` file.

Parameter $s$ contains a fixed-point scale factor that is applied to the character widths in font $k$; font dimensions in font files and other font files are relative to this quantity, which is always positive and less than $2^{27}$. It is given in the same units as the other dimensions of the `dvi` file.  Parameter $d$ is similar to $s$; it is the "design size", and (like $s$) it is given in `dvi` units. Thus, font $k$ is to be used at $mag\cdot s/1000d$ times its normal size.

The remaining part of a font definition gives the external name of the font, which is an ASCII string of length $a+l$. The number $a$ is the length of the "area" or directory, and $l$ is the length of the font name itself; the standard local system font area is supposed to be used when $a=0$. The $n$ field contains the area in its first $a$ bytes.

Font definitions must appear before the first use of a particular font number. Once font $k$ is defined, it must not be defined again; however, we shall see below that font definitions appear in the postamble as well as in the pages, so in this sense each font number is defined exactly twice, if at all. Like $nop$ commands, font definitions can appear before the first $bop$, or between an $eop$ and a $bop$.

The last page in a `dvi` file is followed by $post$; this command introduces the postamble, which summarizes important facts that $\TeX$ has accumulated about the file, making it possible to print subsets of the data with reasonable efficiency. The postamble has the form
$\begin {array} {l}
post{\enspace}p[4]{\enspace}num[4]{\enspace}den[4]{\enspace}mag[4]{\enspace}l[4]{\enspace}u[4]{\enspace}s[2]{\enspace}t[2]\\
{\langle}font\ definitions{\rangle}\\
post\_post{\enspace}q[4]{\enspace}i[1]{\enspace}223's[{\ge}4]
\end {array}$
Here $p$ is a pointer to the final $bop$ in the file. The next three parameters, $num$, $den$, and $mag$, are duplicates of the quantities that appeared in the preamble.

Parameters $l$ and $u$ give respectively the height-plus-depth of the tallest page and the width of the widest page, in the same units as other dimensions of the file. These numbers might be used by a `dvi`-reading program to position individual "pages" on large sheets of film or paper; however, the standard convention for output on normal size paper is to position each page so that the upper left-hand corner is exactly one inch from the left and the top. Experience has shown that it is unwise to design `dvi`-to-printer software that attempts cleverly to center the output; a fixed position of the upper left corner is easiest for users to understand and to work with. Therefore $l$ and $u$ are often ignored.

Parameter $s$ is the maximum stack depth (i.e., the largest excess of $push$ commands over $pop$ commands) needed to process this file. Then comes $t$, the total number of pages ($bop$ commands) present.

The postamble continues with font definitions, which are any number of $fnt\_def$ commands as described above, possibly interspersed with $nop$ commands. Each font number that is used in the `dvi` file must be defined exactly twice: Once before it is first selected by a $fnt$ command, and once in the postamble.

The last part of the postamble, following the $post\_post$ byte that signifies the end of the font definitions, contains $q$, a pointer to the $post$ command that started the postamble. An identification byte, $i$, comes next; this currently equals 2, as in the preamble.

The $i$ byte is followed by four or more bytes that are all equal to the decimal number $223$ (i.e., $0o337$ in octal). $\TeX$ puts out four to seven of these trailing bytes, until the total length of the file is a multiple of four bytes, since this works out best on machines that pack four bytes per word; but any number of 223's is allowed, as long as there are at least four of them. In effect, 223 is a sort of signature that is added at the very end.

This curious way to finish off a `dvi` file makes it feasible for `dvi`-reading programs to find the postamble first, on most computers, even though $\TeX$ wants to write the postamble last. Most operating systems permit random access to individual words or bytes of a file, so the `dvi` reader can start at the end and skip backwards over the $223$'s until finding the identification byte. Then it can back up four bytes, read $q$, and move to byte $q$ of the file. This byte should, of course, contain the value $248$ ($post$); now the postamble can be read, so the `dvi` reader discovers all the information needed for typesetting the pages. Note that it is also possible to skip through the `dvi` file at reasonably high speed to locate a particular page, if that proves desirable. This saves a lot of time, since `dvi` files used in production jobs tend to be large.

## Binary input data

We have seen that a `dvi` file is a sequence of 8-bit bytes. This exact sequence of 8-bit bytes should be passed to `dviDecode` as a `Uint8Array` in the parameter `pDviData`.

`dviDataLoc` is the number of the byte about to be read next from `pDviData`.

```ts
@<Module var...@>=
let dviDataLoc = 0; /* where we are about to look, in pDviData */
```

We shall use another set of simple functions to read the next byte or bytes from `pDviData`. There are seven possibilities, each of which is treated as a separate function in order to minimize the overhead for subroutine calls.

```ts
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
```

## Reading the font information

The `dvi` file format does not include information about character widths, since that would tend to make the files a lot longer. But a program that reads a `dvi` file is supposed to know the widths of the characters that appear in $set\_char$ commands. Therefore `dviDecode` looks at the font files for the fonts that are involved.

For purposes of this program, we need to know only two things about a given character `c` in a given font `f`: 1. Is `c` a legal character in `f`? 2. If so, what is the width of `c`? We also need to know the symbolic name of each font, and we need to know the approximate size of inter-word spaces in each font.

The answers to these questions appear implicitly in the following data structures. Each font in the `dvi` file has an identification number, the external font number, and a name.

The type `DviFont` records all of the information we have obatained about a font and it's characters. The font name, checksum and design size come from the `dvi` file, while the rest of the information is read from the external font file.

The collection of all `DviFont`'s is stored in the map `dviFontMap`, with the DVI font number as key.

A horizontal motion in the range $-4*fontSpace[f]<h<fontSpace[f]$ will be treated as a 'kern'. The legal characters run from $fontBc[f]$ to $fontEc[f]$, inclusive; more precisely, a given character $c$ is valid in font $f$ if and only if $fontBc[f]<=c<=fontEc[f]$ and $width[c]<>invalidWidth$.

```ts
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
```

```ts
@<Module const...@>=
const infinity = 0o17777777777; /* (approximately) */
const invalidWidth = infinity;
```

```ts
@<Module var...@>=
let pFontMap: Map<string,string> | undefined; /* map of external font file names to paths */
let dviFontMap = new Map(); /* the collection of all dvi fonts */
```

```ts
@<Module var...@>=
//let fntCheckSum: number; /* check sum found in the font file - currently disabled since font checksum is not exposed in opentype.js api */
let fntConv: number; /* DVI units per absolute font unit */
```

Here is a procedure that absorbs the necessary information from a font file.

```ts
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
```

```ts
@<Read the header...@>=
const headTable = otfFont.tables['head'];
//fntCheckSum = headTable.checksum;
dviFont.fontOtfUnitsPerEm = headTable.unitsPerEm;
const charCount = otfFont.glyphs.length;
const bc = 0;
const ec = charCount - 1;
```

The most important part of `inputFont` is the width computation, which involves multiplying the relative widths in the font file by the scaling factor in the `dvi` file. This fixed-point multiplication must be done with precisely the same accuracy by all `dvi`-reading programs, in order to validate the assumptions made by `dvi`-writing programs like $\TeX82$.

```ts
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
```

The following code computes pixel widths by simply rounding the font widths to the nearest integer number of pixels, based on the conversion factor `conv` that converts `dvi` units to pixels. However, such a simple formula will not be valid for all fonts, and it will often give results that are off by $\pm1$ when a low-resolution font has been carefully hand-fitted. For example, a font designer often wants to make the letter 'm' a pixel wider or narrower in order to make the font appear more consistent. `dvi`-to-printer programs should therefore input the correct pixel width information from font files whenever there is a chance that it may differ. A warning message may also be desirable in the case that at least one character is found whose pixel width differs from `conv * width` by more than a full pixel.

```ts
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
```

## Optional modes of output

Output can be confined to a restricted subset of the pages by specifying the desired starting page and the maximum number of pages. Furthermore there is an option to specify the resolution of an assumed discrete output device; and there is an option to override the magnification factor that is stated in the `dvi` file.

```ts
@<Module var...@>=
let pDebugMode: boolean /* logs informational messages using the log function */
let pNewMag: number; /* if positive, overrides the postamble's magnification */
```

The starting page is specified by giving a sequence of 1 to 10 numbers or asterisks separated by dots. For example, the specification '`1.*.-5`' can be used to refer to a page output by $\TeX$ when `\count0 = 1` and `\count2 = -5`. (Recall that `bop` commands in a `dvi` file are followed by ten 'count' values.) An asterisk matches any number, so the '`*`' in '`1.*.-5`' means that `\count1` is ignored when specifying the first page. If several pages match the given specification, `dviDecode` will begin with the earliest such page in the file. The default specification '`*`' (which matches all pages) therefore denotes the page at the beginning of the file.

The starting page specification is recorded in two module arrays called `startCount` and `startThere`. For example, '`1.*.-5`' is represented by `startThere[0]=true`, `startCount[0]=1`, `startThere[1]=false`, `startThere[2]=true`, `startCount[2]=-5`. We also set `startVals=2`, to indicate that count 2 was the last one mentioned. The other values of `startCount` and `startThere` are not important, in this example.

```ts
@<Module var...@>=
let startCount: number[]; /* count values to select starting page */
let startThere: boolean[]; /* is the startCount value relevant? */
let startVals: number; /* the last count considered significant */
const count: number[] = []; /* the count values on the current page */
```

Here is a simple subroutine that tests if the current page might be the starting page.

```ts
@c
function startMatch(): boolean { /* does count match the starting spec? */
  let match = true; /* does everything match so far? */
  for (k = 0; k <= startVals; k++) {
    if (startThere[k] && (startCount[k] !== count[k])) match = false;
  }
  return match;
}
```

```ts
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
```

## Defining fonts

`dviDecode` reads the postamble first and loads all of the fonts defined there; then it processes the pages. In this case, a $fnt\_def$ command should match a previous definition if and only if the $fnt\_def$ being processed is not in the postamble.

A module variable `inPostamble` is provided to tell whether we are processing the postamble or not.

```ts
@<Module var...@>=
let inPostamble: boolean; /* are we reading the postamble */
```

Font names included in DVI files generated by `dvilualatex` can be either proper names or file names depending on the `fontspec` commands used to select them. Since `dvi-decode` does not have access to the `luatex` font loader, it can only accept a DVI file that uses file names in the font name strings.

The best was to ensure this is the case is to explicitly define your fonts in your LaTeX source using the `fontspec` commands `\setmainfont`, `setmathfont` etc, using filename form, for all fonts used in the document.

The font name strings included in DVI files generated by `dvilualatex` also append to the end of the font name extra text that encodes font features. We separate this string from the font name and return it in the `fontFeatures` field of the output font object.

Additionally, the font features `mode` and `shaper` affect the meaning of the parameters of the `set` and `put` commands generated by `dvilualatex`. A parameter could mean a Unicode code, or it could mean a glyph index, or it may mean either depending on whether the value falls within a particular range.

As far a I can determine these variations in parameter encodings are not fully documented, and I was not able to discover the various encoding schemes from the LuaTeX source due to it's great many levels of abstraction.

Therefore, rather than try to code for all possible variations of the `mode` and `shaper` options, I have chosen `harf` and `ot` as the `mode` and `shaper` respctively that `dvi-decode` will support. These features can be specified by including `Renderer=OpenType` in the font definitions of the LaTeX source. If these features are not found in the `FontFeatures` string of any font, `dvi-decode` will abort processing.

The following subroutine does the necessary things when a $fnt\_def$ command is being processed.

```ts
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
```

```ts
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
```

```ts
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
```

The information we require from each of the virtual glyphs in the Lua font file is stored in a `LuaGlyph` object.

```ts
@<Type...@>=
type LuaGlyph = {
  index: number | undefined;
  unicode: number | number[] | undefined; /* could be a number or an array of numbers making up a ligature */
}
```

```ts
@<Load the new font, unless there are problems@>=
{
  try {
    otfFont = await opentype.load(curDviFontFile);
  } catch(err) {
    log('!Error loading font file ' + curDviFontFile);
    throw err;
  }
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
```

We will use the package `lua-json` to parse Lua font tables.

```ts
@<Includes@>=
import { parse } from 'lua-json';
```

```ts
@<Load the lua font table@>=
const luaFontFileName = pLuaFontPath + curDviFontName.split('.')[0].toLowerCase() + '.lua';
try {
  if (isBrowser) {
    await fetch(luaFontFileName).then((response) => response.text())
      .then((text: string) => @<Process the lua font table@> )
  } else if (isNode) {
    const fsPromises = await import(/* webpackIgnore: true */ 'fs/promises');
    await fsPromises.readFile(luaFontFileName).then((data: any) => data.toString())
      .then((text: string) => @<Process the lua font table@> );
  }
} catch(err) {
  log('!Error loading lua font table ' + luaFontFileName);
  throw err;
}
```

```ts
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
```

```ts
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
```

## The output data structure

`dviDecode` returns the fonts used along with the calculated glyph positions and sizes for each page of the document. All of this information is encapsulated in an `OutDocument` object, which contains an array of fonts and an array of pages.

```ts
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
```

There may have been several instances of the same font in the DVI file, loaded at different scaling factors. When we get to writing out the glyph objects, the scaling factor is no longer relevant since the glyph size has been calculated. Therefore, all instances of the same font can be consolidated into a single instance with a new font number, and the glyph font numbers replaced with the font number of the single instance.

```ts
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
```

## Low level output routines

Simple text in the `dvi` file is saved in a buffer until `lineLength - 2` characters have accumulated, or until some non-simple `dvi` operation occurs. Then the accumulated text is printed on a line, surrounded by brackets.

```ts
@<Module var...@>=
let textBuf: string; /* saved characters */
```

The `flushText` procedure will empty the buffer if there is something in it.

```ts
@c
function flushText() {
  if (textBuf !== '') {
    debugLog('[' + textBuf + ']');
    textBuf = '';
  }
}
```

And the `outGlyphIndex` procedure puts something in it.

```ts
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
```

```ts
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
```

## Translation to symbolic form

The main work of `dviDecode` is accomplished by the `doPage` procedure, which produces the output for an entire page, assuming that the `bop` command for that page has already been processed. This procedure is essentially an interpretive routine that reads and acts on the `dvi` commands.

The definition of `dvi` files refers to six registers, $(h,v,w,x,y,z)$, which hold integer values in `dvi` units.  In practice, we also need registers `hh` and `vv`, the pixel analogs of $h$ and $v$, since it is not always true that `hh = Math.round(conv*(h))` or `vv = Math.round(conv*(v))`.

The stack of $(h,v,w,x,y,z)$ values is represented by eight arrays called `hStack, ..., zStack`, `hhStack`, and `vvStack`.

```ts
@<Module var...@>=
let h: number, v: number, w: number, x: number, y: number, z: number, hh: number, vv: number; /* current state values */
let hStack: number[] = [], vStack: number[] = [], wStack: number[] = [], xStack: number[] = [], yStack: number[] = [], zStack: number[] = []; /* pushed down values in DVI units */
let hhStack: number[] = [], vvStack: number[] = []; /* pushed down values in pixels */
```

Three characteristics of the pages (their `maxV`, `maxH`, and `maxS`) are specified in the postamble, and a warning message is printed if these limits are exceeded. Actually `maxV` is set to the maximum height plus depth of a page, and `maxH` to the maximum width, for purposes of page layout. Since characters can legally be set outside of the page boundaries, it is not an error when `maxV` or `maxH` is exceeded. But `maxS` should not be exceeded.

The postamble also specifies the total number of pages; `dviDecode` checks to see if this total is accurate.

```ts
@<Module var...@>=
let maxV: number; /* the value of Math.abs(v) should probably not exceed this */
let maxH: number; /* the value of Math.abs(h) should probably not exceed this */
let maxS: number; /* the stack depth should not exceed this */
let maxVSoFar: number, maxHSoFar: number, maxSSoFar: number; /* the record high levels */
let totalPages: number; /* the stated total number of pages */
let pageCount: number; /* the total number of pages seen so far */
```

```ts
@<Reset counters@>=
maxVSoFar = 0;
maxHSoFar = 0;
maxSSoFar = 0;
pageCount = 0;
```

The code shown here uses a convention that has proved to be useful: If the starting page was specified as, e.g., `'{1.*.-5}'`, then all page numbers in the file are displayed by showing the values of counts 0, 1, and 2, separated by dots. Such numbers can, for example, be displayed on the console of a printer when it is working on that page.

```ts
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
```

Before we get into the details of `doPage`, it is convenient to consider a simpler routine that computes the first parameter of each opcode.

```ts
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
```

Here is another subroutine that we need: It computes the number of pixels in the height or width of a rule. Characters and rules will line up properly if the sizes are computed precisely as specified here. (Since conv is computed with some floating-point roundoff error, in a machine-dependent way, format designers who are tailoring something for a particular resolution should not plan their measurements to come out to an exact integer number of pixels; they should compute things so that the rule dimensions are a little less than an integer number of pixels, e.g., 4.99 instead of 5.00.). The `rulePixels` function computes the value of $\lceil conv\cdot x\rceil$.

```ts
@c
function rulePixels(x: number): number {
  const n = Math.trunc(conv * x);
  if (n < (conv * x)) {
    return n + 1;
  } else {
    return n;
  }
}
```

The `doPage` function is organized as a typical interpreter, with a multiway branch on the command code followed by routines that finish up the activities common to different commands.

```ts
@<Module var...@>=
let outPg: OutPage;
let a: number; /* byte number of the current command */
let s: number; /* current stack size */
let ss: number; /* stack size to print */
let curDviFont: DviFont; /* current internal font */
```

Here is the overall setup.

```ts
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
```

Commands are broken down into "major" and "minor" categories: A major command is always shown in full, while a minor one is put into the buffer in abbreviated form. Minor commands, which account for the bulk of most DVI files, involve horizontal spacing and the typesetting of characters in a line; these are shown in full only if pDebugMode is true.

```ts
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
```

```ts
@<Translate the next command...@>=
{
  a = dviDataLoc;
  o = getByte();
  p = firstPar(o);
  if (dviDataLoc >= pDviData.length) badDvi('the file ended prematurely');
  translation_loop:
    while (true) { @<Start translation of command o@> }
}
```

The multiway switch in firstPar, above, was organized by the length of each command; the one in doPage is organized by the semantics.

```ts
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
```

```ts
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
```

```ts
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
```

Rounding to the nearest pixel is best done in the manner shown here, so as to be inoffensive to the eye: When the horizontal motion is small, like a kern, `hh` changes by rounding the kern; but when the motion is large, `hh` changes by rounding the true position `h` so that accumulated rounding errors disappear. We allow a larger space in the negative direction than in the positive one, because $\TeX$ makes comparatively large backspaces when it positions accents.

```ts
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
```

```ts
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
```

Vertical motion is done similarly, but with the threshold between "small" and "large" increased by a factor of five. The idea is to make fractions like "$1\over2$" round consistently, but to absorb accumulated rounding errors in the baseline-skip moves.

```ts
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
```

```ts
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
```

```ts
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
```

```ts
@<Translate a setChar...@>=
@<Translate a character@>
```

```ts
@<Translate a set2...@>=
@<Translate a character@>
```

```ts
@<Translate a set3...@>=
@<Translate a character@>
```

```ts
@<Translate a set4...@>=
@<Translate a character@>
```

This is a routine to translate a character number specified in a `set` or `put` command into a glyph of the current font. If a suitable glyph cannot be found the `.notdef` glyph will be output.

```ts
@<Module const...@>=
const notDefGlyph = 0;
```

```ts
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
```

```ts
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
```

```ts
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
```

A sequence of consecutive rules, or consecutive characters in a fixed-width font whose width is not an integer number of pixels, can cause hh to drift far away from a correctly rounded value. `dviDecode` ensures that the amount of drift will never exceed maxDrift pixels.

```ts
@<Module const...@>=
//const maxDrift = 2 /* we insist that abs(hh-Math.round(conv*(h))) <= maxDrift */
```

```ts
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
```

```ts
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
```

```ts
@<Declare the function showState@>=
function showState() {
  debugLog('level ' + ss.toString() + ':(h=' + h.toString() + ',v=' + v.toString() + ',w=' + w.toString() + ',x=' + x.toString() + ',y=' + y.toString() + ',z=' + z.toString() + ',hh=' + hh.toString() + ',vv=' + vv.toString() + ')');
}
```

```ts
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
```

## Skipping pages

Here is a procedure that reads `dvi` commands following the preamble or following eop, until finding either bop or the postamble.

```ts
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
```

```ts
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
```

module variables called oldBackpointer and newBackpointer are used to check whether the back pointers are properly set up. Another one tells whether we have already found the starting page.

```ts
@<Module var...@>=
let oldBackpointer: number; /* the previous bop command location */
let newBackpointer: number; /* the current |bop| command location */
let started: boolean; /* has the starting page been found? */
```

## Using the backpointers

First comes a routine that illustrates how to find the postamble quickly.

```ts
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
```

Note that the last steps of the above code save the locations of the post byte and the final bop. We had better declare these module variables, together with two more that we will need shortly.

```ts
@<Module var...@>=
let postLoc: number; /* byte location where the postamble begins */
let firstBackpointer: number; /* the pointer following post */
let startLoc: number; /* byte location of the first page to process */
let afterPre: number; /* byte location immediately following the preamble */
```

The next little routine shows how the backpointers can be followed to move through a `dvi` file in reverse order. Ordinarily a `dvi`-reading program would do this only if it wants to print the pages backwards or if it wants to find a specified starting page that is not necessarily the first page in the file; otherwise it would of course be simpler and faster just to read the whole file from the beginning.

```ts
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
```

## Reading the postamble

Now imagine that we are reading the `dvi` file and positioned just four bytes after the post command. That, in fact, is the situation, when the following part of `dviDecode` is called upon to read, translate, and check the rest of the postamble.

```ts
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
```

No warning is given when maxHSoFar exceeds maxH by less than 100, since 100 units is invisibly small; it's approximately the wavelength of visible light, in the case of $\TeX$ output. Rounding errors can be expected to make $h$ and $v$ slightly more than $maxH$ and $maxV$, every once in a while; hence small discrepancies are not cause for alarm.

```ts
@<Compare the l,u,s,t parameters...@>=
if (maxV + 99 < maxVSoFar)
  debugLog('warning: observed maxv was ' + maxVSoFar.toString());
if (maxH + 99 < maxHSoFar)
  debugLog('warning: observed maxh was ' + maxHSoFar.toString());
if (maxS < maxSSoFar)
  debugLog('warning: observed maxstackdepth was ' + maxSSoFar.toString());
```

When we get to the present code, the $post\_post$ command has just been read.

```ts
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
```

```ts
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
```

## Reading the preamble

`dviDecode` looks at the preamble in order to compute the conversion factors, and to display the introductory comment.

```ts
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
```

The conversion factor `conv` is figured as follows: There are exactly $n/d$ decimicrons per `dvi` unit, and 254000 decimicrons per inch, and `resolution` pixels per inch. Then we have to adjust this by the stated amount of magnification.

```ts
@<Module var...@>=
let conv: number; /* converts DVI units to pixels */
let trueConv: number; /* converts unmagnified DVI units to pixels */
let numerator: number, denominator: number; /* stated conversion ratio */
let mag: number; /* magnification factor times 1000 */
```

```ts
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
```

## Initialization of module variables

This routine is called before processing of the dvi file begins.

```ts
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
```
