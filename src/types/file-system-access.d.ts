// Minimal ambient types for the File System Access API save/open pickers.
// TypeScript's lib.dom already ships FileSystemFileHandle / FileSystemHandle /
// FileSystemWritableFileStream, but not yet the Window picker methods or their
// option bags — declared here (merges with lib.dom) so persistence.ts can use
// a shared picker `id` to keep Export and Import in the same folder.

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string | string[]>;
}

type WellKnownDirectory = 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';

interface FilePickerOptionsBase {
  /** Persists the last-used directory across pickers that share the same id. */
  id?: string;
  startIn?: WellKnownDirectory | FileSystemHandle;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

interface SaveFilePickerOptions extends FilePickerOptionsBase {
  suggestedName?: string;
}

interface OpenFilePickerOptions extends FilePickerOptionsBase {
  multiple?: boolean;
}

interface Window {
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
