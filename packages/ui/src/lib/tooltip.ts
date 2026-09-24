import type { Attachment } from 'svelte/attachments';

const DELAY = 450;
// Moving from one tooltip to the next within this window skips the delay.
const WARM = 300;
const GAP = 6;
const EDGE = 8;

// One shared element, shown as a manual popover so it sits in the top layer above modal dialogs.
let tip: HTMLElement | undefined;
let owner: HTMLElement | null = null;
let hiddenAt = 0;

function show(node: HTMLElement, text: string) {
  if (!text) return;
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'sp-tooltip';
    tip.popover = 'manual';
    // Visual echo of the control's accessible name; screen readers already have it.
    tip.setAttribute('aria-hidden', 'true');
    document.body.append(tip);
  }
  tip.textContent = text;
  if (!tip.matches(':popover-open')) tip.showPopover();
  owner = node;

  const r = node.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  let top = r.top - t.height - GAP;
  if (top < EDGE) top = r.bottom + GAP;
  const left = Math.min(Math.max(r.left + r.width / 2 - t.width / 2, EDGE), innerWidth - t.width - EDGE);
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}

function hide(node: HTMLElement) {
  if (owner !== node || !tip) return;
  tip.hidePopover();
  owner = null;
  hiddenAt = performance.now();
}

/**
 * Shows a short label for an icon control on hover and keyboard focus.
 * Defaults to the element's aria-label, read when shown so it stays in sync.
 */
export function tooltip(label?: string): Attachment<HTMLElement> {
  return (node) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // After a press, stay quiet until the pointer leaves: the control is in use.
    let pressed = false;

    const text = () => label ?? node.getAttribute('aria-label') ?? '';
    const cancel = () => clearTimeout(timer);
    const close = () => {
      cancel();
      hide(node);
    };

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || pressed) return;
      cancel();
      if (performance.now() - hiddenAt < WARM || owner) show(node, text());
      else timer = setTimeout(() => show(node, text()), DELAY);
    };
    const onLeave = () => {
      pressed = false;
      close();
    };
    const onDown = () => {
      pressed = true;
      close();
    };
    const onFocus = () => {
      if (node.matches(':focus-visible')) show(node, text());
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', onLeave);
    node.addEventListener('pointerdown', onDown);
    node.addEventListener('focus', onFocus);
    node.addEventListener('blur', close);
    node.addEventListener('keydown', onKey);
    addEventListener('scroll', close, { capture: true, passive: true });

    return () => {
      close();
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', onLeave);
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', close);
      node.removeEventListener('keydown', onKey);
      removeEventListener('scroll', close, { capture: true });
    };
  };
}
