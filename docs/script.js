const state = {
  files: [],
  results: [],
};

const fileInput = document.querySelector("#file-input");
const dropzone = document.querySelector("#dropzone");
const qualityInput = document.querySelector("#quality");
const qualityValue = document.querySelector("#quality-value");
const maxWidthInput = document.querySelector("#max-width");
const maxHeightInput = document.querySelector("#max-height");
const targetSizeInput = document.querySelector("#target-size-mb");
const outputFormatSelect = document.querySelector("#output-format");
const backgroundColorInput = document.querySelector("#background-color");
const compressButton = document.querySelector("#compress-btn");
const downloadAllButton = document.querySelector("#download-all-btn");
const helperText = document.querySelector("#helper-text");
const fileCount = document.querySelector("#file-count");
const originalTotal = document.querySelector("#original-total");
const compressedTotal = document.querySelector("#compressed-total");
const savedTotal = document.querySelector("#saved-total");
const emptyState = document.querySelector("#empty-state");
const resultsContainer = document.querySelector("#results");

qualityInput.addEventListener("input", () => {
  qualityValue.value = `${qualityInput.value}%`;
  updateHelperText();
});

targetSizeInput.addEventListener("input", () => {
  syncActionLabel();
  updateHelperText();
});

outputFormatSelect.addEventListener("change", updateHelperText);

fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  fileInput.value = "";
});

compressButton.addEventListener("click", async () => {
  if (!state.files.length) {
    helperText.textContent = "先选择至少一张图片，再开始处理。";
    return;
  }

  const isTargetMode = Boolean(getTargetBytes());

  compressButton.disabled = true;
  compressButton.textContent = isTargetMode ? "生成中..." : "压缩中...";
  helperText.textContent = isTargetMode
    ? "正在按目标体积生成图片，请稍等。"
    : "正在处理图片，请稍等。";

  try {
    await compressAll();
    helperText.textContent = isTargetMode
      ? "生成完成，可以逐张下载，也可以点“下载全部”。"
      : "压缩完成，可以逐张下载，也可以点“下载全部”。";
  } catch (error) {
    console.error(error);
    helperText.textContent = "处理失败了，换一张图片或刷新页面再试试。";
  } finally {
    compressButton.disabled = false;
    syncActionLabel();
  }
});

downloadAllButton.addEventListener("click", () => {
  state.results.forEach((result, index) => {
    window.setTimeout(() => {
      downloadBlob(result.blobUrl, result.fileName);
    }, index * 160);
  });
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  const files = event.dataTransfer?.files;
  if (files?.length) {
    handleFiles(files);
  }
});

function handleFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));

  if (!files.length) {
    helperText.textContent = "没有识别到图片文件，请重新选择。";
    return;
  }

  clearResults();
  state.files = files;
  updateSummary();
  renderResults([]);
  updateHelperText(
    `已载入 ${files.length} 张图片，参数确认后可以${getTargetBytes() ? "直接生成" : "直接压缩"}。`,
  );
}

function updateHelperText(extraText = "") {
  if (typeof extraText !== "string") {
    extraText = "";
  }

  const targetBytes = getTargetBytes();
  const format = outputFormatSelect.value;
  const quality = Number(qualityInput.value);
  let message = "";

  if (targetBytes) {
    message = `已开启目标体积模式，会尽量压到不超过 ${formatBytes(targetBytes)}。`;

    if (format === "image/png") {
      message += " PNG 会先去掉 alpha 并做无损优化，如果还偏大，再尝试 256 色量化，但不会缩尺寸。";
    } else if (format === "original") {
      message += " 原格式导出时，PNG 会先去掉 alpha 并做无损优化；如果还压不进去，最多再尝试 256 色量化，不会缩尺寸。JPEG / WebP 会优先调质量，必要时再缩尺寸。";
    } else {
      message += ` ${formatLabel(format)} 会优先调质量，必要时再缩尺寸。当前质量上限 ${quality}%。`;
    }
  } else if (format === "image/png") {
    message = "PNG 默认只做去 alpha 和无损优化。如果你还有得太大，填写目标 MB 后才会继续尝试 256 色量化，但不会缩尺寸。";
  } else if (format === "original") {
    message = `当前质量 ${quality}%。原格式导出会尽量保留原格式；如果遇到 PNG，默认只做去 alpha 和无损优化。`;
  } else {
    message = `当前会导出为 ${formatLabel(format)}，质量上限 ${quality}%。`;
  }

  helperText.textContent = extraText ? `${message} ${extraText}` : message;
}

function syncActionLabel() {
  if (compressButton.disabled) {
    return;
  }

  compressButton.textContent = getTargetBytes() ? "直接生成" : "开始压缩";
}

async function compressAll() {
  clearResults();

  const options = {
    qualityCap: Number(qualityInput.value) / 100,
    maxWidth: sanitizeDimension(maxWidthInput.value),
    maxHeight: sanitizeDimension(maxHeightInput.value),
    targetBytes: getTargetBytes(),
    preferredType: outputFormatSelect.value,
    backgroundColor: backgroundColorInput.value,
  };

  const results = [];
  for (const file of state.files) {
    const result = await compressImage(file, options);
    results.push(result);
  }

  state.results = results;
  renderResults(results);
  updateSummary();
}

async function compressImage(file, options) {
  const bitmap = await createImageBitmap(file);
  const size = fitSize(
    bitmap.width,
    bitmap.height,
    options.maxWidth,
    options.maxHeight,
  );
  const outputType = resolveOutputType(file.type, options.preferredType);

  const exported = options.targetBytes
    ? await exportToTarget(bitmap, size, outputType, options)
    : await exportSinglePass(bitmap, size, outputType, options);

  const previewUrl = URL.createObjectURL(exported.previewBlob);
  const blobUrl = URL.createObjectURL(exported.finalBlob);
  const savedBytes = Math.max(0, file.size - exported.finalBlob.size);
  const savedPercent = file.size ? (savedBytes / file.size) * 100 : 0;

  bitmap.close();

  return {
    name: file.name,
    width: exported.width,
    height: exported.height,
    originalSize: file.size,
    compressedSize: exported.finalBlob.size,
    savedPercent,
    outputType,
    fileName: buildOutputName(file.name, outputType),
    previewUrl,
    blobUrl,
    qualityUsed: exported.qualityUsed,
    targetBytes: options.targetBytes,
    targetMet: exported.targetMet,
    exactSizeMatched: exported.exactSizeMatched,
  };
}

async function exportSinglePass(bitmap, size, outputType, options) {
  const canvas = drawSourceToCanvas(
    bitmap,
    size.width,
    size.height,
    outputType,
    options.backgroundColor,
  );
  const blob = isPngOutputType(outputType)
    ? (await exportPngLosslessAttempt(canvas)).blob
    : await canvasToBlob(canvas, outputType, options.qualityCap);

  return {
    previewBlob: blob,
    finalBlob: blob,
    width: size.width,
    height: size.height,
    qualityUsed: isQualityControlledFormat(outputType) ? options.qualityCap : null,
    targetMet: true,
    exactSizeMatched: false,
  };
}

async function exportToTarget(bitmap, initialSize, outputType, options) {
  if (isPngOutputType(outputType)) {
    const canvas = drawSourceToCanvas(
      bitmap,
      initialSize.width,
      initialSize.height,
      outputType,
      options.backgroundColor,
    );
    const attempt = await findBestPngAttemptBySequence(
      canvas,
      options.targetBytes,
    );

    return {
      previewBlob: attempt.blob,
      finalBlob: attempt.blob,
      width: initialSize.width,
      height: initialSize.height,
      qualityUsed: attempt.qualityUsed,
      targetMet: attempt.blob.size <= options.targetBytes,
      exactSizeMatched: attempt.blob.size === options.targetBytes,
    };
  }

  let currentWidth = initialSize.width;
  let currentHeight = initialSize.height;
  let smallestAttempt = null;

  for (let pass = 0; pass < 8; pass += 1) {
    const canvas = drawSourceToCanvas(
      bitmap,
      currentWidth,
      currentHeight,
      outputType,
      options.backgroundColor,
    );

    const attempt = isQualityControlledFormat(outputType)
      ? await findBestQualityAttempt(
          canvas,
          outputType,
          options.targetBytes,
          options.qualityCap,
        )
      : await exportFixedFormatAttempt(
          canvas,
          outputType,
          options.qualityCap,
        );

    attempt.width = currentWidth;
    attempt.height = currentHeight;

    if (!smallestAttempt || attempt.blob.size < smallestAttempt.blob.size) {
      smallestAttempt = attempt;
    }

    if (attempt.blob.size <= options.targetBytes) {
      return {
        previewBlob: attempt.blob,
        finalBlob: attempt.blob,
        width: currentWidth,
        height: currentHeight,
        qualityUsed: attempt.qualityUsed,
        targetMet: true,
        exactSizeMatched: attempt.blob.size === options.targetBytes,
      };
    }

    if (currentWidth <= 1 || currentHeight <= 1) {
      break;
    }

    const scale = clamp(
      Math.sqrt(options.targetBytes / attempt.blob.size) * 0.98,
      0.55,
      0.92,
    );
    const nextWidth = Math.max(1, Math.floor(currentWidth * scale));
    const nextHeight = Math.max(1, Math.floor(currentHeight * scale));

    if (nextWidth === currentWidth && nextHeight === currentHeight) {
      break;
    }

    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  return {
    previewBlob: smallestAttempt.blob,
    finalBlob: smallestAttempt.blob,
    width: smallestAttempt.width,
    height: smallestAttempt.height,
    qualityUsed: smallestAttempt.qualityUsed,
    targetMet: smallestAttempt ? smallestAttempt.blob.size <= options.targetBytes : false,
    exactSizeMatched: false,
  };
}

async function findBestQualityAttempt(canvas, outputType, targetBytes, qualityCap) {
  const minQuality = 0.05;
  const cappedQuality = clamp(qualityCap, minQuality, 1);

  const highAttempt = await exportFixedFormatAttempt(
    canvas,
    outputType,
    cappedQuality,
  );
  if (highAttempt.blob.size <= targetBytes) {
    return highAttempt;
  }

  const lowAttempt = await exportFixedFormatAttempt(
    canvas,
    outputType,
    minQuality,
  );
  if (lowAttempt.blob.size > targetBytes) {
    return lowAttempt;
  }

  let low = minQuality;
  let high = cappedQuality;
  let bestUnder = lowAttempt;
  let smallestOver = highAttempt;

  for (let step = 0; step < 8; step += 1) {
    const quality = (low + high) / 2;
    const attempt = await exportFixedFormatAttempt(canvas, outputType, quality);

    if (attempt.blob.size <= targetBytes) {
      if (!bestUnder || attempt.blob.size > bestUnder.blob.size) {
        bestUnder = attempt;
      }
      low = quality;
    } else {
      if (!smallestOver || attempt.blob.size < smallestOver.blob.size) {
        smallestOver = attempt;
      }
      high = quality;
    }
  }

  return bestUnder ?? smallestOver;
}

async function findBestPngAttemptBySequence(canvas, targetBytes) {
  const losslessAttempt = await exportPngLosslessAttempt(canvas);
  if (losslessAttempt.blob.size <= targetBytes) {
    return losslessAttempt;
  }

  const quantizedAttempt = await exportPngQuantizedAttempt(canvas, 256);
  if (quantizedAttempt.blob.size <= targetBytes) {
    return quantizedAttempt;
  }

  return quantizedAttempt.blob.size < losslessAttempt.blob.size
    ? quantizedAttempt
    : losslessAttempt;
}

async function exportFixedFormatAttempt(canvas, outputType, quality) {
  const blob = await canvasToBlob(canvas, outputType, quality);

  return {
    blob,
    qualityUsed: isQualityControlledFormat(outputType) ? quality : null,
  };
}

function renderResults(results) {
  emptyState.hidden = results.length > 0 || state.files.length > 0;
  resultsContainer.innerHTML = "";

  if (!results.length) {
    if (state.files.length > 0) {
      emptyState.hidden = false;
      emptyState.innerHTML = `
        <strong>图片已就绪</strong>
        <span>点击按钮后，这里会显示预览和下载按钮。</span>
      `;
    } else {
      emptyState.hidden = false;
      emptyState.innerHTML = `
        <strong>还没有图片</strong>
        <span>把图片拖进上面的区域，或者点击选择文件。</span>
      `;
    }

    downloadAllButton.disabled = true;
    return;
  }

  emptyState.hidden = true;
  downloadAllButton.disabled = false;

  results.forEach((result) => {
    const card = document.createElement("article");
    card.className = "result-card";

    const savingsClass = result.compressedSize <= result.originalSize
      ? "savings-good"
      : "savings-bad";
    const savingsText = result.compressedSize <= result.originalSize
      ? `-${result.savedPercent.toFixed(1)}%`
      : `+${(
          ((result.compressedSize - result.originalSize) / result.originalSize) *
          100
        ).toFixed(1)}%`;

    const targetRows = result.targetBytes
      ? `
        <div class="meta-row">
          <span>目标大小</span>
          <strong>${formatBytes(result.targetBytes)}</strong>
        </div>
        <div class="meta-row">
          <span>目标状态</span>
          <strong class="${result.exactSizeMatched ? "savings-good" : "savings-bad"}">
            ${result.exactSizeMatched ? "已精确命中" : result.targetMet ? "已压到目标内" : "目标过小，已尽量接近"}
          </strong>
        </div>
      `
      : "";

    const qualityRow = result.qualityUsed === null
      ? ""
      : `
        <div class="meta-row">
          <span>${result.targetBytes ? "最终质量" : "压缩质量"}</span>
          <strong>${formatPercent(result.qualityUsed)}</strong>
        </div>
      `;

    card.innerHTML = `
      <div class="result-preview">
        <img src="${result.previewUrl}" alt="${escapeHtml(result.name)} 的压缩预览" />
      </div>
      <div class="result-meta">
        <h3>${escapeHtml(result.name)}</h3>
        <div class="meta-row">
          <span>尺寸</span>
          <strong>${result.width} x ${result.height}</strong>
        </div>
        <div class="meta-row">
          <span>原始大小</span>
          <strong>${formatBytes(result.originalSize)}</strong>
        </div>
        <div class="meta-row">
          <span>压缩后</span>
          <strong>${formatBytes(result.compressedSize)}</strong>
        </div>
        <div class="meta-row">
          <span>输出格式</span>
          <strong>${formatLabel(result.outputType)}</strong>
        </div>
        ${qualityRow}
        ${targetRows}
        <div class="meta-row">
          <span>变化比例</span>
          <strong class="${savingsClass}">${savingsText}</strong>
        </div>
        <div class="card-actions">
          <button class="download-btn" type="button">下载图片</button>
        </div>
      </div>
    `;

    card.querySelector(".download-btn")?.addEventListener("click", () => {
      downloadBlob(result.blobUrl, result.fileName);
    });

    resultsContainer.appendChild(card);
  });
}

function updateSummary() {
  fileCount.textContent = `${state.files.length} 张`;

  const originalBytes = state.files.reduce((sum, file) => sum + file.size, 0);
  const compressedBytes = state.results.reduce(
    (sum, result) => sum + result.compressedSize,
    0,
  );

  originalTotal.textContent = formatBytes(originalBytes);
  compressedTotal.textContent = compressedBytes ? formatBytes(compressedBytes) : "0 B";

  if (!originalBytes || !compressedBytes) {
    savedTotal.textContent = "0%";
    return;
  }

  const diffPercent = ((originalBytes - compressedBytes) / originalBytes) * 100;
  const prefix = diffPercent >= 0 ? "-" : "+";
  savedTotal.textContent = `${prefix}${Math.abs(diffPercent).toFixed(1)}%`;
}

function clearResults() {
  state.results.forEach((result) => {
    if (result.previewUrl && result.previewUrl !== result.blobUrl) {
      URL.revokeObjectURL(result.previewUrl);
    }

    URL.revokeObjectURL(result.blobUrl);
  });
  state.results = [];
}

function fitSize(width, height, maxWidth, maxHeight) {
  if (!maxWidth && !maxHeight) {
    return {width, height};
  }

  const widthRatio = maxWidth ? maxWidth / width : 1;
  const heightRatio = maxHeight ? maxHeight / height : 1;
  const scale = Math.min(widthRatio, heightRatio, 1);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function drawSourceToCanvas(bitmap, width, height, outputType, backgroundColor) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {alpha: true});
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  if (outputType === "image/jpeg") {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
  } else if (isPngOutputType(outputType)) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
  } else {
    context.clearRect(0, 0, width, height);
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  return canvas;
}

function sanitizeDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return Math.round(number);
}

function getTargetBytes() {
  const targetMb = Number(targetSizeInput.value);
  if (!Number.isFinite(targetMb) || targetMb <= 0) {
    return null;
  }

  return Math.round(targetMb * 1024 * 1024);
}

function resolveOutputType(inputType, preferredType) {
  if (preferredType !== "original") {
    return preferredType;
  }

  if (["image/jpeg", "image/png", "image/webp"].includes(inputType)) {
    return inputType;
  }

  return "image/jpeg";
}

function isQualityControlledFormat(type) {
  return type === "image/jpeg" || type === "image/webp";
}

function isPngOutputType(type) {
  return type === "image/png";
}

function buildOutputName(originalName, outputType) {
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const baseName = originalName.replace(/\.[^.]+$/, "");
  return `${baseName}-compressed.${extensionMap[outputType] || "jpg"}`;
}

async function exportPngLosslessAttempt(canvas) {
  if (typeof UPNG === "undefined") {
    const blob = await canvasToBlob(canvas, "image/png");
    return {blob, qualityUsed: null};
  }

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  const imageData = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const rgb = rgbaToRgb(imageData.data);
  const encoded = UPNG.encodeLL(
    [rgb.buffer],
    canvas.width,
    canvas.height,
    3,
    0,
    8,
  );

  return {
    blob: new Blob([encoded], {type: "image/png"}),
    qualityUsed: null,
  };
}

async function exportPngQuantizedAttempt(canvas, colorCount) {
  if (typeof UPNG === "undefined") {
    const blob = await canvasToBlob(canvas, "image/png");
    return {blob, qualityUsed: null};
  }

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  const imageData = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const encoded = UPNG.encode(
    [imageData.data.buffer],
    canvas.width,
    canvas.height,
    colorCount,
  );

  return {
    blob: new Blob([encoded], {type: "image/png"}),
    qualityUsed: null,
  };
}

function rgbaToRgb(rgba) {
  const rgb = new Uint8Array((rgba.length / 4) * 3);

  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < rgba.length; sourceIndex += 4) {
    rgb[targetIndex] = rgba[sourceIndex];
    rgb[targetIndex + 1] = rgba[sourceIndex + 1];
    rgb[targetIndex + 2] = rgba[sourceIndex + 2];
    targetIndex += 3;
  }

  return rgb;
}

function canvasToBlob(canvas, outputType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to export canvas."));
          return;
        }

        resolve(blob);
      },
      outputType,
      quality,
    );
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatLabel(type) {
  if (type === "image/jpeg") {
    return "JPEG";
  }

  if (type === "image/webp") {
    return "WebP";
  }

  if (type === "image/png") {
    return "PNG";
  }

  return type;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function downloadBlob(blobUrl, fileName) {
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

syncActionLabel();
updateHelperText();
