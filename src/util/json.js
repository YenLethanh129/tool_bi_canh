const fs = require('fs');

// Notepad tren Windows luu file UTF-8 kem BOM (\uFEFF), va BOM la ky tu dau
// tien nen JSON.parse() fail. Doc file van giu BOM thi se loai bo no.
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parse(text, where) {
  try {
    return JSON.parse(stripBom(text));
  } catch (err) {
    throw new Error(`${where} khong parse duoc: ${err.message}`);
  }
}

function read(path, where = path) {
  return parse(fs.readFileSync(path, 'utf8'), where);
}

module.exports = { parse, read, stripBom };