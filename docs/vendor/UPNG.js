(function () {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  var needsPako = !window.pako;
  var needsUpng = !window.UPNG
    || typeof window.UPNG.encode !== "function"
    || typeof window.UPNG.encodeLL !== "function"
    || typeof window.UPNG.quantize !== "function"
    || !window.UPNG.encode.compress
    || !window.UPNG.quantize.getNearest;

  if (!needsPako && !needsUpng) {
    return;
  }

  var tags = "";

  if (needsPako) {
    tags += '<script src="https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js"><\\/script>';
  }

  if (needsUpng) {
    tags += '<script src="https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js"><\\/script>';
  }

  if (tags) {
    document.write(tags);
  }
})();
