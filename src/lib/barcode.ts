/**
 * Lecture des codes-barres (EAN-13/8, UPC) avec la caméra ou une photo.
 * Chrome sur Android a un lecteur intégré (BarcodeDetector) ; ailleurs (Safari sur iPhone…), on charge à la demande
 * le décodeur ZXing compilé en WebAssembly, servi par notre propre site (pas de CDN, marche hors-ligne une fois chargé).
 */
export interface Detector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
let detector: Promise<Detector> | null = null;

export function getBarcodeDetector(): Promise<Detector> {
  detector ??= (async () => {
    const Native = (window as unknown as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
    if (Native) {
      const supported = (await Native.getSupportedFormats?.().catch(() => [])) ?? [];
      if (supported.includes('ean_13')) return new Native({ formats: FORMATS });
    }
    const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) });
    return new BarcodeDetector({ formats: FORMATS as never });
  })().catch((e) => {
    detector = null;
    throw e;
  });
  return detector;
}

/** Code-barres lu sur une photo (appareil photo ou galerie). */
export async function readBarcodeFromFile(file: File): Promise<string | null> {
  const d = await getBarcodeDetector();
  const bitmap = await createImageBitmap(file);
  const found = await d.detect(bitmap);
  return found[0]?.rawValue ?? null;
}
