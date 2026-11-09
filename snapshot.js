const maxJsonBytes = 320 * 1024 * 1024;
const tables = ["venues", "schools", "people", "degrees", "authors", "papers", "institutionPapers",
  "institutionFaculty", "schoolComparison", "collaboration", "mobility", "snapshots", "coverage", "logs"];

export async function readSnapshot(stream) {
  if (!stream) throw new Error("스냅샷이 비어 있습니다.");
  const reader = stream.pipeThrough(new DecompressionStream("gzip")).getReader();
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
