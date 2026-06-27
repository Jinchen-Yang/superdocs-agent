import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { memo } from 'react';

// 助手正文：GFM(表格/列表) + KaTeX 数学公式，套用 .aui-md 样式。
// 外链一律新标签页打开：点"来源"不会跳走丢掉当前会话。
export const MarkdownText = memo(function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      className="aui-md"
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
      }}
    />
  );
});
