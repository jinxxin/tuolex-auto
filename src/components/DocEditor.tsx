import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Button, Space, Tooltip, Divider } from 'antd';
import {
  UndoOutlined, RedoOutlined, BoldOutlined, ItalicOutlined, StrikethroughOutlined,
  OrderedListOutlined, UnorderedListOutlined, FontSizeOutlined, HighlightOutlined,
  MinusOutlined, ClearOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface Props {
  value: string;                       // TipTap JSON 字符串
  onChange: (json: string) => void;
  placeholder?: string;
}

// ============ TipTap 富文本编辑器（Word 观感）============
export default function DocEditor({ value, onChange, placeholder }: Props) {
  const { t } = useTranslation();
  const ph = placeholder ?? t('docEditor.editorPh');
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: ph }),
    ],
    content: value ? JSON.parse(value) : undefined,
    onUpdate: ({ editor: e }) => onChange(JSON.stringify(e.getJSON())),
    editorProps: {
      attributes: { class: 'doc-editor', spellcheck: 'false' },
    },
  });

  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, icon: React.ReactNode, tip: string) => (
    <Tooltip title={tip}><Button size="small" type={active ? 'primary' : 'text'} icon={icon} onMouseDown={(e) => e.preventDefault()} onClick={onClick} /></Tooltip>
  );

  return (
    <div>
      <Space size={2} wrap style={{ padding: '6px 0 10px', borderBottom: '1px solid #e8e8e8', marginBottom: 12 }}>
        {btn(editor.can().undo(), () => editor.chain().focus().undo().run(), <UndoOutlined />, t('docEditor.undo'))}
        {btn(editor.can().redo(), () => editor.chain().focus().redo().run(), <RedoOutlined />, t('docEditor.redo'))}
        <Divider type="vertical" />
        {btn(editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <span style={{ fontWeight: 700 }}>H1</span>, t('docEditor.heading1'))}
        {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <span style={{ fontWeight: 600 }}>H2</span>, t('docEditor.heading2'))}
        {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <span style={{ fontWeight: 600 }}>H3</span>, t('docEditor.heading3'))}
        {btn(editor.isActive('paragraph'), () => editor.chain().focus().setParagraph().run(), <FontSizeOutlined />, t('docEditor.paragraph'))}
        <Divider type="vertical" />
        {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <BoldOutlined />, t('docEditor.bold'))}
        {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <ItalicOutlined />, t('docEditor.italic'))}
        {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <StrikethroughOutlined />, t('docEditor.strike'))}
        <Divider type="vertical" />
        {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <UnorderedListOutlined />, t('docEditor.bulletList'))}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <OrderedListOutlined />, t('docEditor.orderedList'))}
        {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), <HighlightOutlined />, t('docEditor.blockquote'))}
        {btn(editor.isActive('horizontalRule'), () => editor.chain().focus().setHorizontalRule().run(), <MinusOutlined />, t('docEditor.horizontalRule'))}
        <Divider type="vertical" />
        {btn(false, () => editor.chain().focus().clearNodes().unsetAllMarks().run(), <ClearOutlined />, t('docEditor.clearFormat'))}
      </Space>
      <EditorContent editor={editor} />
    </div>
  );
}
