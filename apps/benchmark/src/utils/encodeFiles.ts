/**
 * Encode dropped Spine files as base64 for inline embedding in encrypted
 * share reports. The report viewer decodes them back to Blob URLs and
 * feeds them to Spinefolio.
 */

export interface EncodedFile {
  name: string;
  type: string;
  data: string; // base64
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export async function encodeFile(file: File): Promise<EncodedFile> {
  const buf = await file.arrayBuffer();
  return {
    name: file.name,
    type: file.type || inferMime(file.name),
    data: arrayBufferToBase64(buf),
  };
}

export async function encodeFiles(files: File[]): Promise<EncodedFile[]> {
  return Promise.all(files.map(encodeFile));
}

function inferMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'atlas': return 'text/plain';
    case 'json': return 'application/json';
    case 'skel': return 'application/octet-stream';
    default: return 'application/octet-stream';
  }
}
