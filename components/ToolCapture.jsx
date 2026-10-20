'use client';
import { ReportProvider } from './ReportContext';
import EmailCapture from './EmailCapture';

/**
 * The tool and its capture card, in one client boundary.
 *
 * The capture card is only useful if it can carry the result the visitor just
 * produced, and the result lives inside the widget — so the two have to share
 * a tree. This component is that tree: the widget publishes its report, the
 * card picks it up when the visitor asks for it by email.
 */
export default function ToolCapture({ tool, toolName, headline, sub, children }) {
  return (
    <ReportProvider>
      {children}
      <EmailCapture tool={tool} toolName={toolName} headline={headline} sub={sub} />
    </ReportProvider>
  );
}
