import {
  MAX_OFFICE_ARCHIVE_ENTRIES,
  MAX_OFFICE_ARCHIVE_UNCOMPRESSED_BYTES,
  MAX_OFFICE_XML_ENTRY_BYTES,
} from "../config/constants.js";

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_SIGNATURE = 0x02014b50;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

export class UnsafeOfficeArchiveError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsafeOfficeArchiveError";
  }
}

export function assertOfficeArchiveSafe(input, fileName = "Office 文件", options = {}) {
  const bytes = toUint8Array(input);
  const limits = {
    maxEntries: options.maxEntries ?? MAX_OFFICE_ARCHIVE_ENTRIES,
    maxUncompressedBytes: options.maxUncompressedBytes ?? MAX_OFFICE_ARCHIVE_UNCOMPRESSED_BYTES,
    maxXmlEntryBytes: options.maxXmlEntryBytes ?? MAX_OFFICE_XML_ENTRY_BYTES,
  };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) {
    throw unsafe(fileName, "文件包结构不完整或已损坏");
  }

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entriesOnDisk !== totalEntries
    || totalEntries === 0xffff
    || centralDirectorySize === 0xffffffff
    || centralDirectoryOffset === 0xffffffff
  ) {
    throw unsafe(fileName, "暂不支持分卷或 ZIP64 Office 文件");
  }
  if (totalEntries > limits.maxEntries) {
    throw unsafe(fileName, `内部文件数量超过安全上限（${limits.maxEntries} 项）`);
  }
  if (centralDirectoryOffset + centralDirectorySize > eocdOffset) {
    throw unsafe(fileName, "中央目录范围异常，文件可能已损坏");
  }

  let cursor = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > view.byteLength || view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_FILE_SIGNATURE) {
      throw unsafe(fileName, "中央目录条目异常，文件可能已损坏");
    }
    const uncompressedBytes = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const nextCursor = cursor + 46 + fileNameLength + extraLength + commentLength;
    if (uncompressedBytes === 0xffffffff || nextCursor > view.byteLength) {
      throw unsafe(fileName, "内部条目使用了不受支持的 ZIP64 格式或目录已损坏");
    }

    const entryName = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + fileNameLength));
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > limits.maxUncompressedBytes) {
      throw unsafe(fileName, `声明的解压体积超过安全上限（${formatMegabytes(limits.maxUncompressedBytes)}）`);
    }
    if (/\.(?:xml|rels)$/i.test(entryName) && uncompressedBytes > limits.maxXmlEntryBytes) {
      throw unsafe(fileName, `内部文本条目过大（${entryName}）`);
    }
    cursor = nextCursor;
  }

  return {
    entryCount: totalEntries,
    uncompressedBytes: totalUncompressedBytes,
  };
}

function findEndOfCentralDirectory(view) {
  const firstPossibleOffset = Math.max(0, view.byteLength - 22 - MAX_ZIP_COMMENT_BYTES);
  for (let offset = view.byteLength - 22; offset >= firstPossibleOffset; offset -= 1) {
    if (view.getUint32(offset, true) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === view.byteLength) return offset;
  }
  return -1;
}

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError("Office 文件必须以 ArrayBuffer 或 Uint8Array 读取");
}

function unsafe(fileName, reason) {
  return new UnsafeOfficeArchiveError(`${fileName} 无法安全导入：${reason}`);
}

function formatMegabytes(bytes) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
