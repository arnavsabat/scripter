// Crash boundaries (D-084). A panel's crash replaces only that panel, so writing never stops; a
// crash anywhere else shows the full-page notice. Either way the error is reported (D-083).
// React only offers this as a class component.
import { Component, type ReactNode } from 'react';
import { Crashed } from '../pages/Notice';
import { reportCrash } from '../usage';
import { TextAction } from './TextAction';

class Boundary extends Component<
  { fallback: (reset: () => void) => ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    reportCrash(error);
  }
  override render() {
    return this.state.failed
      ? this.props.fallback(() => this.setState({ failed: false }))
      : this.props.children;
  }
}

export function PageBoundary({ children }: { children: ReactNode }) {
  return <Boundary fallback={() => <Crashed />}>{children}</Boundary>;
}

/**
 * "This panel hit a problem. Reload": Reload draws the panel again from scratch. A crashed menu
 * (`quiet`) just closes: a note where a menu was would hang in the toolbar.
 */
export function PanelBoundary({
  children,
  quiet = false,
}: {
  children: ReactNode;
  quiet?: boolean;
}) {
  return (
    <Boundary
      fallback={(reset) =>
        quiet ? null : (
          <div className="list" role="alert">
            <p className="none">
              This panel hit a problem. <TextAction label="Reload" onClick={reset} />
            </p>
          </div>
        )
      }
    >
      {children}
    </Boundary>
  );
}
