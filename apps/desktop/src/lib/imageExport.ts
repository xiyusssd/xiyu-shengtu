import JSZip from "jszip";

/** data URL 或裸 base64 → Uint8Array */
export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string; ext: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    // 只接受 base64 data URL；其它（blob:/http:/文件路径）明确报错，避免 atob 抛不透明异常
    throw new Error("不支持的图片格式（需要 base64 data URL）");
  }
  const mime = match[1];
  const b64 = match[2];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime.includes("svg")
    ? "svg"
    : mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : mime.includes("webp")
        ? "webp"
        : "png";
  return { bytes, mime, ext };
}

/** 复制图片到系统剪贴板（支持 png/jpeg 位图）*/
export async function copyImageToClipboard(dataUrl: string): Promise<void> {
  const { bytes, mime } = dataUrlToBytes(dataUrl);
  const supported = ["image/png", "image/jpeg"];
  const targetMime = supported.includes(mime) ? mime : "image/png";

  // 若原始是 SVG，先渲染成 PNG 再复制（Clipboard API 不接受 image/svg+xml）
  let finalBlob: Blob;
  if (targetMime === "image/png" && mime.includes("svg")) {
    finalBlob = await svgBytesToPngBlob(bytes);
  } else {
    finalBlob = new Blob([bytes as BlobPart], { type: targetMime });
  }

  await navigator.clipboard.write([
    new ClipboardItem({ [finalBlob.type]: finalBlob }),
  ]);
}

async function svgBytesToPngBlob(svgBytes: Uint8Array): Promise<Blob> {
  const svgBlob = new Blob([svgBytes as BlobPart], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width || 1024;
    canvas.height = img.height || 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas ctx");
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/png"
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface ZipEntry {
  filename: string;
  prompt: string;
  dataUrl: string;
  seed?: number;
}

/** 把一批图片打包为 zip 并触发下载 */
export async function exportBatchAsZip(
  entries: ZipEntry[],
  zipName = `imagegen-batch-${Date.now()}.zip`
): Promise<void> {
  const zip = new JSZip();
  const metadataLines: string[] = ["# xiyu-shengtu 批量导出", ""];

  const usedNames = new Set<string>();
  entries.forEach((entry, idx) => {
    const { bytes, ext } = dataUrlToBytes(entry.dataUrl);
    // 优先用调用方给的 filename；没有则回退序号名。保证扩展名 + 去重
    const rowNum = String(idx + 1).padStart(2, "0");
    let base = entry.filename?.trim()
      ? entry.filename.replace(/\.(png|jpg|jpeg|webp|svg)$/i, "")
      : rowNum;
    let filename = `${base}.${ext}`;
    let n = 2;
    while (usedNames.has(filename)) {
      filename = `${base}-${n++}.${ext}`;
    }
    usedNames.add(filename);
    zip.file(filename, bytes);
    metadataLines.push(
      `## ${filename}`,
      `- prompt: ${entry.prompt}`,
      entry.seed !== undefined ? `- seed: ${entry.seed}` : "",
      ""
    );
  });
  zip.file("README.md", metadataLines.join("\n"));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = zipName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
