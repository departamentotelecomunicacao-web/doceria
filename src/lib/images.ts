// Compressão de imagens no navegador antes do upload (painel): redimensiona e
// converte para WebP (ou JPEG quando o navegador não codifica WebP).

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  extension: "webp" | "jpg";
  contentType: "image/webp" | "image/jpeg";
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"];
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return "Formato não suportado. Use JPG, PNG ou WebP.";
  if (file.size > MAX_UPLOAD_BYTES) return "Imagem muito grande (máximo de 15 MB).";
  return null;
}

async function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp && webp.type === "image/webp") {
    return { blob: webp, width, height, extension: "webp", contentType: "image/webp" };
  }
  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  if (!jpeg) throw new Error("Não foi possível processar a imagem");
  return { blob: jpeg, width, height, extension: "jpg", contentType: "image/jpeg" };
}
