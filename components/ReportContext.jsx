'use client';
import { createContext, useContext, useMemo, useState } from 'react';

// The report the visitor just produced, shared between the tool widget and
// the capture card underneath it.
//
// The widget knows the result; the capture card knows the visitor's email.
// The email has to carry the result, so one of them has to hand it over — and
// this is that handover, rather than a prop drilled through a dozen layers
// that do not know what the report is.
//
// The report shape is deliberately tiny and flat: a title, a headline, a list
// of label/value rows, and one fix tip. The server reduces it further before
// it is allowed near an email (see `lib/report-email.js`), so a widget cannot
// smuggle anything past the bounds by publishing a richer object.
const ReportContext = createContext(null);

export function ReportProvider({ children }) {
  const [report, setReport] = useState(null);
  const value = useMemo(() => ({ report, publish: setReport }), [report]);
  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

/**
 * Publish the result of a run, or clear it.
 *
 * Returns a no-op when there is no provider, so a widget can be rendered
 * outside a tool page (a test, a storybook) without crashing.
 */
export function useReport() {
  const ctx = useContext(ReportContext);
  return ctx ? ctx.publish : () => {};
}

/** The current report, if any. */
export function useCurrentReport() {
  const ctx = useContext(ReportContext);
  return ctx ? ctx.report : null;
}
