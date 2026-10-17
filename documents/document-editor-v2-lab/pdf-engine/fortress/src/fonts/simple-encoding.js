// Conservative simple-font encoding tables. We intentionally support a well-audited
// WinAnsi/ASCII subset and explicit Differences. Unsupported glyphs are refused,
// never silently replaced with '?'.

const AGL = new Map();
const REV = new Map();
function add(name, cp) { AGL.set(name, cp); if (!REV.has(cp)) REV.set(cp, name); }

const asciiNames = {
  space:0x20, exclam:0x21, quotedbl:0x22, numbersign:0x23, dollar:0x24, percent:0x25,
  ampersand:0x26, quotesingle:0x27, parenleft:0x28, parenright:0x29, asterisk:0x2a,
  plus:0x2b, comma:0x2c, hyphen:0x2d, period:0x2e, slash:0x2f, zero:0x30, one:0x31,
  two:0x32, three:0x33, four:0x34, five:0x35, six:0x36, seven:0x37, eight:0x38,
  nine:0x39, colon:0x3a, semicolon:0x3b, less:0x3c, equal:0x3d, greater:0x3e,
  question:0x3f, at:0x40, bracketleft:0x5b, backslash:0x5c, bracketright:0x5d,
  asciicircum:0x5e, underscore:0x5f, grave:0x60, braceleft:0x7b, bar:0x7c,
  braceright:0x7d, asciitilde:0x7e,
};
for (const [n,c] of Object.entries(asciiNames)) add(n,c);
for (let c=65;c<=90;c++) add(String.fromCharCode(c),c);
for (let c=97;c<=122;c++) add(String.fromCharCode(c),c);
Object.entries({
  Euro:0x20ac, quotesinglbase:0x201a, florin:0x192, quotedblbase:0x201e, ellipsis:0x2026,
  dagger:0x2020, daggerdbl:0x2021, circumflex:0x2c6, perthousand:0x2030, Scaron:0x160,
  guilsinglleft:0x2039, OE:0x152, Zcaron:0x17d, quoteleft:0x2018, quoteright:0x2019,
  quotedblleft:0x201c, quotedblright:0x201d, bullet:0x2022, endash:0x2013, emdash:0x2014,
  tilde:0x2dc, trademark:0x2122, scaron:0x161, guilsinglright:0x203a, oe:0x153,
  zcaron:0x17e, Ydieresis:0x178, exclamdown:0xa1, cent:0xa2, sterling:0xa3, currency:0xa4,
  yen:0xa5, brokenbar:0xa6, section:0xa7, dieresis:0xa8, copyright:0xa9, ordfeminine:0xaa,
  guillemotleft:0xab, logicalnot:0xac, registered:0xae, macron:0xaf, degree:0xb0, plusminus:0xb1,
  acute:0xb4, mu:0xb5, paragraph:0xb6, periodcentered:0xb7, cedilla:0xb8, ordmasculine:0xba,
  guillemotright:0xbb, questiondown:0xbf,
  Agrave:0xc0,Aacute:0xc1,Acircumflex:0xc2,Atilde:0xc3,Adieresis:0xc4,Aring:0xc5,AE:0xc6,
  Ccedilla:0xc7,Egrave:0xc8,Eacute:0xc9,Ecircumflex:0xca,Edieresis:0xcb,Igrave:0xcc,
  Iacute:0xcd,Icircumflex:0xce,Idieresis:0xcf,Eth:0xd0,Ntilde:0xd1,Ograve:0xd2,Oacute:0xd3,
  Ocircumflex:0xd4,Otilde:0xd5,Odieresis:0xd6,multiply:0xd7,Oslash:0xd8,Ugrave:0xd9,
  Uacute:0xda,Ucircumflex:0xdb,Udieresis:0xdc,Yacute:0xdd,Thorn:0xde,germandbls:0xdf,
  agrave:0xe0,aacute:0xe1,acircumflex:0xe2,atilde:0xe3,adieresis:0xe4,aring:0xe5,ae:0xe6,
  ccedilla:0xe7,egrave:0xe8,eacute:0xe9,ecircumflex:0xea,edieresis:0xeb,igrave:0xec,
  iacute:0xed,icircumflex:0xee,idieresis:0xef,eth:0xf0,ntilde:0xf1,ograve:0xf2,oacute:0xf3,
  ocircumflex:0xf4,otilde:0xf5,odieresis:0xf6,divide:0xf7,oslash:0xf8,ugrave:0xf9,
  uacute:0xfa,ucircumflex:0xfb,udieresis:0xfc,yacute:0xfd,thorn:0xfe,ydieresis:0xff,
  fi:0xfb01, fl:0xfb02,
}).forEach(([n,c])=>add(n,c));

const WIN_HIGH = {
  0x80:'Euro',0x82:'quotesinglbase',0x83:'florin',0x84:'quotedblbase',0x85:'ellipsis',0x86:'dagger',
  0x87:'daggerdbl',0x88:'circumflex',0x89:'perthousand',0x8a:'Scaron',0x8b:'guilsinglleft',0x8c:'OE',
  0x8e:'Zcaron',0x91:'quoteleft',0x92:'quoteright',0x93:'quotedblleft',0x94:'quotedblright',0x95:'bullet',
  0x96:'endash',0x97:'emdash',0x98:'tilde',0x99:'trademark',0x9a:'scaron',0x9b:'guilsinglright',
  0x9c:'oe',0x9e:'zcaron',0x9f:'Ydieresis',0xa0:'space',0xad:'hyphen'
};
for (let c=0xa1;c<=0xff;c++) if (!WIN_HIGH[c]) { const n=REV.get(c); if(n) WIN_HIGH[c]=n; }

function asciiTable() {
  const t={};
  for (let c=0x20;c<=0x7e;c++) {
    let name = REV.get(c);
    if (c>=48 && c<=57) name=['zero','one','two','three','four','five','six','seven','eight','nine'][c-48];
    t[c]=name || String.fromCharCode(c);
  }
  return t;
}

export function buildEncodingTable(baseEncoding='WinAnsiEncoding', differences=[]) {
  const codeToName=asciiTable();
  if (baseEncoding==='WinAnsiEncoding' || !baseEncoding) Object.assign(codeToName,WIN_HIGH);
  // MacRoman/Standard high bytes are deliberately not guessed. ASCII stays safe.
  let code=null;
  for (const item of differences || []) {
    if (typeof item==='number') code=item;
    else if (typeof item==='string' && code!==null) { codeToName[code]=item; code++; }
  }
  const nameToCode={};
  for (const [k,v] of Object.entries(codeToName)) if (nameToCode[v]===undefined) nameToCode[v]=Number(k);
  return { baseEncoding, codeToName, nameToCode };
}

export function glyphNameToUnicode(name) {
  if (AGL.has(name)) return String.fromCodePoint(AGL.get(name));
  if (/^uni[0-9A-Fa-f]{4}$/.test(name)) return String.fromCodePoint(Number.parseInt(name.slice(3),16));
  if (/^u[0-9A-Fa-f]{4,6}$/.test(name)) return String.fromCodePoint(Number.parseInt(name.slice(1),16));
  return null;
}

export function decodeSimple(bytes, table, toUnicode=null) {
  let out='';
  for (const b of bytes) {
    const direct = toUnicode?.decodeCode?.(new Uint8Array([b]));
    if (direct != null) { out += direct; continue; }
    const name=table.codeToName[b];
    const u=name ? glyphNameToUnicode(name) : null;
    out += u ?? '\uFFFD';
  }
  return out;
}

export function encodeSimple(text, table, toUnicode=null) {
  const out=[]; const unsupported=[];
  for (const ch of Array.from(text)) {
    if (ch==='\n') continue;
    const viaMap = toUnicode?.encodeUnicode?.(ch);
    if (viaMap?.length===1) { out.push(viaMap[0]); continue; }
    const cp=ch.codePointAt(0); const name=REV.get(cp); const code=name ? table.nameToCode[name] : undefined;
    if (code===undefined) unsupported.push(ch); else out.push(code);
  }
  return { success:unsupported.length===0, bytes:new Uint8Array(out), unsupportedCharacters:unsupported };
}

export const _agl = { AGL, REV };
