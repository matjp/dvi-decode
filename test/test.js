const fs = require('fs');
const dvi = require( '../out/dvi-decode.js');

//const dviFileName = '<path to your test dvi file>'; // e.g. '/home/<user>/dvi-files/intro.dvi'

fs.readFile(dviFileName, (err, dviData) => {
    if (err) {
        console.error(err)
    } else {
        fs.readFile('test/font.map', 'utf8', (err, data) => {
            if (err) {
                console.error(err);
            } else {
                const fontMap = new Map();        
                const mapLines = data.split('\n');
                mapLines.forEach(line => {
                    const words = line.split(':');
                    fontMap.set(words[0],words[1]);
                });
                dvi.dviDecode(dviData, 96, 1000, fontMap, true)
                    .then(doc => { console.log(JSON.stringify(JSON.parse(doc), undefined, 2)) })
                    .catch((error) => { console.error(error)} );
            }
        });
    }
});        
