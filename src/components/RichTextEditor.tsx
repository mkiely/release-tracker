import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { markdownToHtml, looksLikeMarkdown } from '../lib/markdown';
import { normalizeBlanks } from '../lib/htmlNormalize';
import { Icon } from './Icon';
import { IconButton } from './primitives';
import styles from './RichTextEditor.module.css';

/** The basic-minimum formatting toolbar: bold/italic + the two list types. Marks
 *  and nodes it drives all come from StarterKit already loaded below — no new
 *  extensions. Markdown shortcuts (`**bold**`, `- `, `1. `) keep working alongside it. */
function Toolbar({ editor }: { editor: Editor }) {
  // Prevent the mousedown's default focus/blur dance from collapsing the editor's
  // selection before the click's command runs.
  const guard = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className={styles.toolbar} onMouseDown={guard}>
      <IconButton
        icon={Icon.bold}
        title="Bold (Ctrl/Cmd+B)"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <IconButton
        icon={Icon.italic}
        title="Italic (Ctrl/Cmd+I)"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <IconButton
        icon={Icon.bulletList}
        title="Bulleted list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <IconButton
        icon={Icon.orderedList}
        title="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
    </div>
  );
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

  return (
    <div className={editable ? styles.box : `${styles.box} ${styles.readOnly}`}>
      {editable && editor && <Toolbar editor={editor} />}
      <div className={styles.editorScroll}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
