import { Fragment } from "react";
import { splitMentions } from "@/lib/mentions";
import { MentionLink } from "./MentionLink";

/**
 * Render plain text (comments, etc.) with `@username` turned into a profile
 * link. Single newlines are preserved as line breaks. Unlike
 * {@link MarkdownContent} this applies no other Markdown — comments stay plain.
 */
export function MentionText({ children }: { children: string }) {
  const lines = children.split("\n");
  return (
    <>
      {lines.map((line, li) => (
        <Fragment key={li}>
          {li > 0 && <br />}
          {splitMentions(line).map((seg, i) =>
            seg.type === "mention" ? (
              <MentionLink key={i} username={seg.username}>
                {seg.raw}
              </MentionLink>
            ) : (
              <Fragment key={i}>{seg.value}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}

export default MentionText;
