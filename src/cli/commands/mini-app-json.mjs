/** Strict JSON with bounded depth and duplicate-key rejection, including escaped keys. */
export function parseMiniAppJson(text) {
  let i = 0;
  const whitespace = () => {
    while (/[\t\n\r ]/.test(text[i] ?? "x")) i++;
  };
  const error = () => {
    throw new Error("Invalid or ambiguous package JSON");
  };
  function string() {
    const start = i++;
    let escaped = false;
    while (i < text.length) {
      const c = text[i++];
      if (!escaped && c === '"') return JSON.parse(text.slice(start, i));
      if (!escaped && c === "\\") escaped = true;
      else escaped = false;
    }
    error();
  }
  function value(depth) {
    if (depth > 16) error();
    whitespace();
    const c = text[i];
    if (c === '"') return string();
    if (c === "{" || c === "[") {
      i++;
      whitespace();
      const object = c === "{";
      const result = object ? Object.create(null) : [];
      const keys = new Set();
      const close = object ? "}" : "]";
      if (text[i] === close) {
        i++;
        return result;
      }
      while (i < text.length) {
        whitespace();
        let key;
        if (object) {
          if (text[i] !== '"') error();
          key = string();
          if (keys.has(key)) error();
          keys.add(key);
          whitespace();
          if (text[i++] !== ":") error();
        }
        const child = value(depth + 1);
        if (object) result[key] = child;
        else result.push(child);
        whitespace();
        if (text[i] === close) {
          i++;
          return result;
        }
        if (text[i++] !== ",") error();
      }
      error();
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(i),
    );
    if (!match) error();
    i += match[0].length;
    const result = JSON.parse(match[0]);
    if (typeof result === "number" && !Number.isFinite(result)) error();
    return result;
  }
  const result = value(0);
  whitespace();
  if (i !== text.length) error();
  return result;
}
