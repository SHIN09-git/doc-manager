const FALLBACK_ENCODINGS = ["gb18030", "gbk", "big5"];

export async function readTextFile(file) {
  const buffer = await file.arrayBuffer();
  return decodeTextBuffer(buffer);
}

export function decodeTextBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
  if (bytes.length === 0) return "";

  const bom = detectBom(bytes);
  if (bom) return stripBom(decodeWithLabel(bom.encoding, bytes.slice(bom.offset), false));

  const utf16Guess = guessUtf16(bytes);
  if (utf16Guess) return stripBom(decodeWithLabel(utf16Guess, bytes, false));

  const candidates = [];
  const utf8 = tryDecode("utf-8", bytes, true);
  if (utf8 !== null) {
    candidates.push({ encoding: "utf-8", text: utf8, score: scoreDecodedText(utf8) });
  }

  FALLBACK_ENCODINGS.forEach((encoding) => {
    const text = tryDecode(encoding, bytes, false);
    if (text !== null) {
      candidates.push({ encoding, text, score: scoreDecodedText(text) });
    }
  });

  if (candidates.length === 0) {
    return stripBom(new TextDecoder().decode(bytes));
  }

  candidates.sort((a, b) => b.score - a.score);
  return stripBom(candidates[0].text);
}

function detectBom(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: "utf-8", offset: 3 };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: "utf-16le", offset: 2 };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: "utf-16be", offset: 2 };
  }
  return null;
}

function guessUtf16(bytes) {
  const sampleLength = Math.min(bytes.length, 200);
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] !== 0) continue;
    if (index % 2 === 0) evenZeros += 1;
    else oddZeros += 1;
  }
  if (oddZeros > sampleLength * 0.2 && evenZeros < oddZeros / 4) return "utf-16le";
  if (evenZeros > sampleLength * 0.2 && oddZeros < evenZeros / 4) return "utf-16be";
  return "";
}

function tryDecode(encoding, bytes, fatal) {
  try {
    return decodeWithLabel(encoding, bytes, fatal);
  } catch {
    return null;
  }
}

function decodeWithLabel(encoding, bytes, fatal) {
  return new TextDecoder(encoding, { fatal }).decode(bytes);
}

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function scoreDecodedText(text) {
  const value = String(text || "");
  if (!value) return 0;
  const length = value.length;
  const readable = countMatches(value, /[\u4e00-\u9fffA-Za-z0-9\s，。！？、；：“”‘’（）《》【】,.!?;:()[\]{}<>/@#%&*_+=|'"-]/g);
  const replacements = countMatches(value, /\uFFFD/g);
  const controls = countMatches(value, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g);
  const mojibake = countMatches(value, /锟|Ã|Â|Ð|Ñ|€|™|œ|鏂|妗|瀛|鍔|鍏|鍙|浜|绋|绾|鐨|勬|佹|紝|俓/g);

  return readable / length - replacements * 10 - controls * 5 - mojibake * 0.8;
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}
