import type { Severity, SignatureStatus } from '@/types/forensight';

export type Finding = {
  title: string;
  description: string;
  severity: Severity;
  detection_reason: string;
};

export type SignatureAnalysis = {
  detectedFormat: string;
  detectedMime: string | null;
  isExecutable: boolean;
  extension: string;
  signatureStatus: SignatureStatus;
  findings: Finding[];
};

type SignatureDef = {
  format: string;
  mime: string;
  extensions: string[];
  executable?: boolean;
  matches: (bytes: Uint8Array) => boolean;
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);

const ascii = (bytes: Uint8Array, text: string, offset = 0) =>
  startsWith(bytes, Array.from(text, (char) => char.charCodeAt(0)), offset);

const ZIP_EXTENSIONS = ['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'jar', 'apk', 'epub'];

const SIGNATURES: SignatureDef[] = [
  { format: 'PNG image', mime: 'image/png', extensions: ['png'], matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { format: 'JPEG image', mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { format: 'GIF image', mime: 'image/gif', extensions: ['gif'], matches: (b) => ascii(b, 'GIF8') },
  { format: 'WEBP image', mime: 'image/webp', extensions: ['webp'], matches: (b) => ascii(b, 'RIFF') && ascii(b, 'WEBP', 8) },
  { format: 'WAV audio', mime: 'audio/wav', extensions: ['wav'], matches: (b) => ascii(b, 'RIFF') && ascii(b, 'WAVE', 8) },
  { format: 'PDF document', mime: 'application/pdf', extensions: ['pdf'], matches: (b) => ascii(b, '%PDF') },
  { format: 'MP4 / QuickTime media', mime: 'video/mp4', extensions: ['mp4', 'm4a', 'mov', 'm4v'], matches: (b) => ascii(b, 'ftyp', 4) },
  { format: 'MP3 audio', mime: 'audio/mpeg', extensions: ['mp3'], matches: (b) => ascii(b, 'ID3') || startsWith(b, [0xff, 0xfb]) },
  { format: 'ZIP-based archive', mime: 'application/zip', extensions: ZIP_EXTENSIONS, matches: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  { format: 'GZIP archive', mime: 'application/gzip', extensions: ['gz', 'tgz'], matches: (b) => startsWith(b, [0x1f, 0x8b]) },
  { format: '7-Zip archive', mime: 'application/x-7z-compressed', extensions: ['7z'], matches: (b) => startsWith(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) },
  { format: 'RAR archive', mime: 'application/vnd.rar', extensions: ['rar'], matches: (b) => startsWith(b, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) },
  { format: 'SQLite database', mime: 'application/vnd.sqlite3', extensions: ['db', 'sqlite', 'sqlite3'], matches: (b) => ascii(b, 'SQLite format 3\u0000') },
  { format: 'Windows executable (PE)', mime: 'application/x-msdownload', extensions: ['exe', 'dll', 'scr', 'com', 'sys'], executable: true, matches: (b) => startsWith(b, [0x4d, 0x5a]) },
  { format: 'ELF executable', mime: 'application/x-elf', extensions: ['elf', 'so', 'bin', 'out'], executable: true, matches: (b) => startsWith(b, [0x7f, 0x45, 0x4c, 0x46]) },
  { format: 'Mach-O executable', mime: 'application/x-mach-binary', extensions: ['macho', 'dylib', 'bin'], executable: true, matches: (b) => startsWith(b, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(b, [0xce, 0xfa, 0xed, 0xfe]) },
  { format: 'Shell script (shebang)', mime: 'text/x-shellscript', extensions: ['sh', 'bash'], executable: true, matches: (b) => startsWith(b, [0x23, 0x21]) },
];

const TEXT_EXTENSIONS = ['txt', 'csv', 'log', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'py', 'rb', 'java', 'c', 'cpp', 'go', 'rs', 'yaml', 'yml', 'ini', 'cfg'];
const EXECUTABLE_EXTENSIONS = ['exe', 'dll', 'scr', 'com', 'bat', 'cmd', 'ps1', 'vbs', 'msi', 'js', 'jar', 'sh', 'apk', 'pif', 'lnk', 'hta'];
const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'txt', 'rtf', 'csv', 'mp4', 'mp3'];

const EMBEDDED_PE_MARKER = 'This program cannot be run in DOS mode';
const MAX_SCAN_BYTES = 52428800;

export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

function isMostlyText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (sample.length === 0) return false;
  let printable = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e) || byte >= 0x80) printable += 1;
  }
  return printable / sample.length > 0.95;
}

function containsAscii(bytes: Uint8Array, text: string): boolean {
  const needle = Array.from(text, (char) => char.charCodeAt(0));
  const first = needle[0];
  const limit = Math.min(bytes.length, MAX_SCAN_BYTES) - needle.length;
  for (let index = 0; index <= limit; index += 1) {
    if (bytes[index] !== first) continue;
    if (startsWith(bytes, needle, index)) return true;
  }
  return false;
}

function detectSignature(bytes: Uint8Array): SignatureDef | null {
  return SIGNATURES.find((signature) => signature.matches(bytes)) ?? null;
}

function compareDeclaredExtension(extension: string, detected: SignatureDef | null, textLike: boolean): SignatureStatus {
  if (!detected) {
    if (textLike && TEXT_EXTENSIONS.includes(extension)) return 'match';
    return 'unknown';
  }
  if (!extension) return 'unknown';
  return detected.extensions.includes(extension) ? 'match' : 'mismatch';
}

function buildFindings(filename: string, extension: string, bytes: Uint8Array, detected: SignatureDef | null, status: SignatureStatus): Finding[] {
  const findings: Finding[] = [];
  const parts = filename.toLowerCase().split('.');

  if (parts.length >= 3 && EXECUTABLE_EXTENSIONS.includes(parts[parts.length - 1]) && DOCUMENT_EXTENSIONS.includes(parts[parts.length - 2])) {
    findings.push({
      title: 'Double file extension',
      description: `The name "${filename}" ends with an executable-type extension after a document-type extension, a pattern often used to disguise file types.`,
      severity: 'medium',
      detection_reason: `Final extension ".${parts[parts.length - 1]}" follows ".${parts[parts.length - 2]}".`,
    });
  }

  if (status === 'mismatch' && detected) {
    const executableMismatch = Boolean(detected.executable);
    findings.push({
      title: executableMismatch ? 'Executable content with non-executable extension' : 'Extension does not match file content',
      description: executableMismatch
        ? `The file content identifies as ${detected.format}, but the declared extension ".${extension}" does not indicate an executable. Review before trusting this file.`
        : `The file content identifies as ${detected.format}, but the declared extension ".${extension}" does not match.`,
      severity: executableMismatch ? 'high' : 'medium',
      detection_reason: `Magic bytes identify ${detected.format}; expected extensions: ${detected.extensions.slice(0, 6).join(', ')}.`,
    });
  }

  if (detected?.executable) {
    findings.push({
      title: 'Executable file signature detected',
      description: `The file content begins with the ${detected.format} signature. Executable content is flagged for review only; this is not a malware verdict.`,
      severity: 'medium',
      detection_reason: `Magic bytes identify ${detected.format}.`,
    });
  }

  if (!detected && bytes.length > 0 && !isMostlyText(bytes)) {
    findings.push({
      title: 'Unrecognized binary signature',
      description: 'The file content does not match any supported signature, so its true format cannot be confirmed.',
      severity: 'info',
      detection_reason: 'No supported magic bytes matched the first bytes of the file.',
    });
  }

  if (filename.includes('\u202e')) {
    findings.push({
      title: 'Right-to-left override character in filename',
      description: 'The filename contains a Unicode control character that can visually reverse the displayed extension.',
      severity: 'high',
      detection_reason: 'Filename contains U+202E (RIGHT-TO-LEFT OVERRIDE).',
    });
  }

  if (filename.length > 120 || /[ .]$/.test(filename)) {
    findings.push({
      title: 'Unusual file naming pattern',
      description: 'The filename is unusually long or ends with a space or dot, which can hide the real extension in some file browsers.',
      severity: 'low',
      detection_reason: `Filename length is ${filename.length} characters and ${/[ .]$/.test(filename) ? 'ends with a space or dot' : 'is within normal length'}.`,
    });
  }

  if (bytes.length === 0) {
    findings.push({
      title: 'Empty file',
      description: 'The uploaded file contains zero bytes.',
      severity: 'info',
      detection_reason: 'File size is 0 bytes.',
    });
  }

  if (!detected?.executable && bytes.length > 0 && containsAscii(bytes, EMBEDDED_PE_MARKER)) {
    findings.push({
      title: 'Embedded Windows program stub',
      description: 'The file contains the DOS stub text used by Windows executables. The embedded program may be hidden inside a non-executable file.',
      severity: 'low',
      detection_reason: 'The DOS stub message was found within the file contents.',
    });
  }

  return findings;
}

export function analyzeFileSignature(filename: string, bytes: Uint8Array, declaredMime: string): SignatureAnalysis {
  const extension = getExtension(filename);
  const detected = detectSignature(bytes);
  const textLike = !detected && isMostlyText(bytes);
  const signatureStatus = compareDeclaredExtension(extension, detected, textLike);

  const detectedFormat = detected?.format ?? (textLike ? 'Plain text' : 'Unknown format');
  const detectedMime = detected?.mime ?? (textLike ? 'text/plain' : null);

  return {
    detectedFormat,
    detectedMime: detectedMime ?? (declaredMime || null),
    isExecutable: Boolean(detected?.executable),
    extension,
    signatureStatus,
    findings: buildFindings(filename, extension, bytes, detected, signatureStatus),
  };
}
