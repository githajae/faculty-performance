const magic = new TextEncoder().encode("FPAGE1\n");
const maxFileBytes = 95 * 1024 * 1024;
const maxJsonBytes = 320 * 1024 * 1024;
const tables = ["venues", "schools", "people", "degrees", "authors", "papers", "institutionPapers",
  "institutionFaculty", "schoolComparison", "collaboration", "mobility", "snapshots", "coverage", "logs"];

export async function unlockSnapshot(input, shareKey) {
  const bytes = new Uint8Array(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength);
  if (bytes.length < magic.length + 29 || bytes.length > maxFileBytes ||
      !magic.every((value, index) => bytes[index] === value)) {
    throw new Error("스냅샷 파일 형식이 올바르지 않습니다.");
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(shareKey)) {
    throw new Error("올바른 열람 키가 포함된 공유 링크를 열어 주세요.");
  }
  const rawKey = Uint8Array.from(atob(shareKey.replace(/-/g, "+").replace(/_/g, "/") + "="), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  rawKey.fill(0);
  const dataStart = magic.length + 12;
  let compressed;
  try {
    compressed = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: bytes.subarray(magic.length, dataStart),
      additionalData: magic,
    }, key, bytes.subarray(dataStart));
  } catch {
    throw new Error("열람 키가 맞지 않거나 스냅샷이 손상되었습니다.");
  }
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0;
  const pieces = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxJsonBytes) {
      await reader.cancel();
      throw new Error("스냅샷이 브라우저에서 열 수 있는 크기를 초과했습니다.");
    }
    pieces.push(decoder.decode(value, { stream: true }));
  }
  pieces.push(decoder.decode());
  const data = JSON.parse(pieces.join(""));
  if (data.version !== 1 || !Number.isInteger(data.referenceYear) || !Array.isArray(data.fields) ||
      !tables.every(name => Array.isArray(data.tables?.[name]?.columns) && Array.isArray(data.tables[name].rows))) {
    throw new Error("이 화면에서 지원하는 스냅샷 버전이 아닙니다.");
  }
  return data;
}
