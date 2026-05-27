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

outputFormatSelect.addEventListener("change", updateHelperText);
fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  fileInput.value = "";
});

compressButton.addEventListener("click", async () => {
  if (!state.files.length) {
    helperText.textContent = "先选择至少一张图片，再开始压缩。";
    return;
  }

  compressButton.disabled = true;
  compressButton.textContent = "压缩中...";
  helperText.textContent = "正在处理图片，请稍等。";

  try {
    await compressAll();
    helperText.textContent = "压缩完成，可以逐张下载，也可以点“下载全部”。";
  } catch (error) {
    console.error(error);
    helperText.textContent = "处理失败了，换一张图片或刷新页面再试试。";
  } finally {
    compressButton.disabled = false;
    compressButton.textContent = "开始压缩";
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
  helperText.textContent = `已载入 ${files.length} 张图片，参数确认后可以直接压缩。`;
}

function updateHelperText() {
  const format = outputFormatSelect.value;
  const quality = Number(qualityInput.value);

  if (format === "image/png") {
    helperText.textContent = "PNG 更适合保真和透明背景，体积可能不会明显变小。";
    return;
  }

  if (format === "original") {
    helperText.textContent = `当前质量 ${quality}% 。如果原图是 PNG，压缩收益可能有限。`;
    return;
  }

  helperText.textContent = `当前会导出为 ${formatLabel(format)}，质量 ${quality}% 。`;
}

async function compressAll() {
  clearResults();

  const options = {
    quality: Number(qualityInput.value) / 100,
    maxWidth: sanitizeDimension(maxWidthInput.value),
    maxHeight: sanitizeDimension(maxHeightInput.value),
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

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d", {alpha: true});
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  const outputType = resolveOutputType(file.type, options.preferredType);

  if (outputType === "image/jpeg") {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas, outputType, options.quality);
  const blobUrl = URL.createObjectURL(blob);
  const previewUrl = blobUrl;
  const savedBytes = Math.max(0, file.size - blob.size);
  const savedPercent = file.size ? (savedBytes / file.size) * 100 : 0;

  bitmap.close();

  return {
    name: file.name,
    width: canvas.width,
    height: canvas.height,
    originalSize: file.size,
    compressedSize: blob.size,
    savedPercent,
    outputType,
    fileName: buildOutputName(file.name, outputType),
    previewUrl,
    blobUrl,
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
        <span>点击“开始压缩”后，这里会显示预览和下载按钮。</span>
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
      : `+${((result.compressedSize - result.originalSize) / result.originalSize * 100).toFixed(1)}%`;

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
  state.results.forEach((result) => URL.revokeObjectURL(result.blobUrl));
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

function sanitizeDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return Math.round(number);
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

function buildOutputName(originalName, outputType) {
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const baseName = originalName.replace(/\.[^.]+$/, "");
  return `${baseName}-compressed.${extensionMap[outputType] || "jpg"}`;
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

updateHelperText();
