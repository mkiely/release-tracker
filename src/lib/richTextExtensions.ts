import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';

/** The one extension set for work-item HTML descriptions. The editor and the
 *  canonicalization in htmlNormalize both import it: ProseMirror drops any tag its
 *  schema lacks, so if the two lists diverged, one side would strip tables/images
 *  the other kept and a description would compare (or save) as changed. */
export const richTextExtensions = [
  StarterKit,
  // Plain <table> markup out — no resize handles / inline column widths to round-trip.
  TableKit.configure({ table: { resizable: false } }),
  // Render-only for now: block-level, no data: URIs (they would bloat the localStorage blob and push payloads).
  Image.configure({ inline: false, allowBase64: false }),
];
