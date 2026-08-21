import { useEffect, useId, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type ModalSize = 'small' | 'medium' | 'large';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  wide?: boolean;
  closeOnBackdrop?: boolean;
}

interface ScrollLockSnapshot {
  scrollX: number;
  scrollY: number;
  body: Pick<CSSStyleDeclaration, 'position' | 'top' | 'left' | 'width' | 'overflow' | 'paddingRight'>;
  htmlOverflow: string;
}

const FOCUSABLE_SELECTOR = [
  '[data-dialog-initial-focus]',
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let modalStack: string[] = [];
let scrollLockSnapshot: ScrollLockSnapshot | null = null;
let stackVersion = 0;
const stackListeners = new Set<() => void>();

function notifyStackListeners() {
  stackVersion += 1;
  stackListeners.forEach((listener) => listener());
}

function subscribeToStack(listener: () => void) {
  stackListeners.add(listener);
  return () => stackListeners.delete(listener);
}

function getStackSnapshot() {
  return stackVersion;
}

function lockPageScroll() {
  if (scrollLockSnapshot) return;
  const body = document.body;
  const root = document.documentElement;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
  const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;

  scrollLockSnapshot = {
    scrollX,
    scrollY,
    body: {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    },
    htmlOverflow: root.style.overflow,
  };

  root.classList.add('modal-open');
  body.classList.add('modal-open');
  root.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = `-${scrollX}px`;
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  if (scrollbarWidth > 0) body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
}

function unlockPageScroll() {
  if (!scrollLockSnapshot) return;
  const snapshot = scrollLockSnapshot;
  const body = document.body;
  const root = document.documentElement;

  body.style.position = snapshot.body.position;
  body.style.top = snapshot.body.top;
  body.style.left = snapshot.body.left;
  body.style.width = snapshot.body.width;
  body.style.overflow = snapshot.body.overflow;
  body.style.paddingRight = snapshot.body.paddingRight;
  root.style.overflow = snapshot.htmlOverflow;
  root.classList.remove('modal-open');
  body.classList.remove('modal-open');
  scrollLockSnapshot = null;
  window.scrollTo(snapshot.scrollX, snapshot.scrollY);
}

function addToModalStack(id: string) {
  if (modalStack.includes(id)) return;
  if (modalStack.length === 0) lockPageScroll();
  modalStack = [...modalStack, id];
  notifyStackListeners();
}

function removeFromModalStack(id: string) {
  if (!modalStack.includes(id)) return;
  modalStack = modalStack.filter((item) => item !== id);
  if (modalStack.length === 0) unlockPageScroll();
  notifyStackListeners();
}

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    const style = window.getComputedStyle(element);
    return element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  });
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'medium', wide = false, closeOnBackdrop = true }: ModalProps) {
  const reactId = useId();
  const modalId = `modal-${reactId.replace(/:/g, '')}`;
  const titleId = `${modalId}-title`;
  const descriptionId = `${modalId}-description`;
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useSyncExternalStore(subscribeToStack, getStackSnapshot, getStackSnapshot);
  const depth = modalStack.indexOf(modalId);
  const isTopmost = depth >= 0 && depth === modalStack.length - 1;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    addToModalStack(modalId);
    return () => {
      removeFromModalStack(modalId);
      const opener = openerRef.current;
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, [modalId, open]);

  useEffect(() => {
    if (!open || !isTopmost) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusFirst = () => {
      const focusable = focusableElements(panel);
      const preferred = focusable.find((element) => element.matches('[data-dialog-initial-focus], input[autofocus], textarea[autofocus], select[autofocus]'));
      const target = preferred ?? focusable[0] ?? panel;
      target.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusFirst);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!panel.contains(event.target as Node)) focusFirst();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
    };
  }, [isTopmost, open]);

  if (!open) return null;
  const resolvedSize = wide ? 'large' : size;
  const layerStyle = { '--modal-layer': 1000 + Math.max(depth, 0) * 10 } as CSSProperties;

  return createPortal(
    <div
      className={`modal-backdrop${isTopmost ? ' modal-backdrop--active' : ''}`}
      role="presentation"
      aria-hidden={!isTopmost}
      style={layerStyle}
      onMouseDown={(event) => {
        if (isTopmost && closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className={`modal-sheet modal-sheet--${resolvedSize}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="modal-header">
          <div><p className="eyebrow">Project 75</p><h2 id={titleId}>{title}</h2>{subtitle ? <p id={descriptionId}>{subtitle}</p> : null}</div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={`Close ${title}`}><X size={20} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
