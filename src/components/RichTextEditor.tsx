import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import styles from './RichTextEditor.module.css';

/** A deliberately minimal rich-text editor for work-item HTML descriptions.
 *  Tiptap + StarterKit only — no toolbar. Formatting is via markdown-style input
 *  rules (`## `, `- `, `> `, `**bold**`) and keyboard shortcuts (Cmd/Ctrl+B/I).
 *  Parsing through ProseMirror's schema drops any tag/attribute the schema does
 *  not know, so connector HTML is sanitized on the way in without DOMPurify, and
 *  {@link https://tiptap.dev getHTML()} re-serializes a clean, schema-valid string.
 *  Renders read-only (selectable, no caret) when `editable` is false. */
export function RichTextEditor({
  value,
  onChange,
  editable = true,
}: {
  value: string;
  onChange?: (html: string) => void;
  editable?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editable,
    // Avoid the strict-mode double-mount hydration warning; render in an effect.
    immediatelyRender: false,
    editorProps: { attributes: { class: styles.content } },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  // Keep editability in sync without tearing down the editor instance.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // Reflect external resets (e.g. a different item) when the value diverges from
  // the editor's own serialized HTML. The equality guard prevents an onUpdate loop.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  return <EditorContent editor={editor} className={editable ? styles.box : `${styles.box} ${styles.readOnly}`} />;
}
