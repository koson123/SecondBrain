import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function useDialogFocus(onClose: () => void) {
  const element = useRef<HTMLElement | null>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const getControls = () =>
      Array.from(
        element.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ) || [],
      ).filter((e) => e.offsetParent !== null);
    getControls()[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        latestClose.current();
      }
      if (e.key === "Tab") {
        const controls = getControls();
        const first = controls[0],
          last = controls.at(-1);
        if (!first) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, []);
  return element;
}

export function Modal({ title, subtitle, onClose, children }: any) {
  const dialogRef = useDialogFocus(onClose);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="close icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
        {children}
      </section>
    </div>
  );
}

export function PageFrame({ title, subtitle, children }: any) {
  return (
    <section className="utility-page">
      <div className="page-heading">
        <div>
          <p className="page-kicker">NOTEBOOK</p>
          <h1>{title}</h1>
          <p className="page-description">{subtitle}</p>
        </div>
      </div>
      <div className="utility-content">{children}</div>
    </section>
  );
}
