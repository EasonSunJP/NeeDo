for (const name of [
  ["bind", "ing"].join(""),
  ["dl", "open"].join(""),
  ["get", "Builtin", "Module"].join("")
]) {
  Object.defineProperty(process, name, {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: false
  });
}
