import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Preserve the line breaks people actually type. Standard Markdown collapses a
 * single newline into a space, but in a social post a lone Enter is meant to be
 * a real line break. We turn each single newline into a GFM hard break (two
 * trailing spaces) while leaving blank-line paragraph breaks and fenced code
 * blocks (where newlines are significant) untouched.
 */
function preserveLineBreaks(src: string): string {
  return src
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(/([^\n])\n(?!\n)/g, "$1  \n"),
    )
    .join("");
}

/**
 * MarkdownContent — renders post/comment text as GitHub-flavored Markdown.
 * react-markdown does not render raw HTML by default, so this is safe from
 * injection. Links open in a new tab. Used for post bodies (the composer stays
 * a plain textarea where the user types Markdown).
 */
export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {preserveLineBreaks(children)}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownContent;
