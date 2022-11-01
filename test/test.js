import { readFile } from 'fs';
import { dviDecode } from '../out/dvi-decode.js';

const dviFileName = '<path to your test dvi file>'; // e.g. '/home/<user>/dvi-files/intro.dvi'
const luaFontPath = '<path to your LuaTex font cache>'; // e.g. '/home/<user>/.texlive2021/texmf-var/luatex-cache/generic/fonts/otl'

readFile(dviFileName, (err, dviData) => {
    if (err) {
        console.error(err)
    } else {
        readFile('test/font.map', 'utf8', (err, data) => {
            if (err) {
                console.error(err);
            } else {
                const fontMap = new Map();        
                const mapLines = data.split('\n');
                mapLines.forEach(line => {
                    const words = line.split(':');
                    fontMap.set(words[0],words[1]);
                });
                dviDecode(dviData, 96, 1000, fontMap, luaFontPath, true)
                    .then(doc => { console.log(JSON.stringify(JSON.parse(doc), undefined, 2)) })
                    .catch((error) => { console.error(error)} );
            }
        });
    }
});        
