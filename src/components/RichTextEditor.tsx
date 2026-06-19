import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { markdownToHtml, looksLikeMarkdown } from '../lib/markdown';
import styles from './RichTextEditor.module.css';

// Connector HTML often uses <p><br></p> as a blank-line separator. TipTap
// parses the <br> as a hard break node, which then gets a second ProseMirror
// trailing placeholder appended — producing <p><br><br.ProseMirror-trailingBreak></p>
// and defeating the :only-child CSS collapse rule. Stripping the <br> first
// lets TipTap treat the paragraph as truly empty so only the placeholder remains.
function normalizeBlanks(html: string): string {
  return html.replace(/<p>(\s*<br[^>]*>)+\s*<\/p>/gi, '<p></p>');
}

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
    content: normalizeBlanks(value),
    editable,
    // Avoid the strict-mode double-mount hydration warning; render in an effect.
    immediatelyRender: false,
    editorProps: {
      attributes: { class: styles.content },
      // Format pasted Markdown. We key off the plain-text flavor: if it looks like
      // Markdown we convert it, even when the clipboard also carries an HTML flavor
      // (most apps attach one for plain-text copies, which is just the literal
      // Markdown re-styled). Anything that isn't Markdown falls through so genuine
      // rich-HTML and plain-text pastes keep tiptap's default handling.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        if (!text || !looksLikeMarkdown(text)) return false;
        const doc = new DOMParser().parseFromString(markdownToHtml(text), 'text/html');
        const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(doc.body);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  // Keep editability in sync without tearing down the editor instance.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // Reflect external resets (e.g. a different item) when the value diverges from
  // the editor's own serialized HTML. The equality guard prevents an onUpdate loop.
  // Normalize both sides so that connector blank-line paragraphs (<p><br></p>)
  // and their TipTap-serialized equivalents compare equal after normalization.
  useEffect(() => {
    const normalized = normalizeBlanks(value);
    if (editor && normalized !== normalizeBlanks(editor.getHTML())) {
      editor.commands.setContent(normalized, { emitUpdate: false });
    }
  }, [editor, value]);

  return <EditorContent editor={editor} className={editable ? styles.box : `${styles.box} ${styles.readOnly}`} />;
}
