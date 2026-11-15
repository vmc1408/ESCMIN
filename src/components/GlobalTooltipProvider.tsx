import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

type Placement = 'top' | 'bottom' | 'right';

interface TooltipState {
  text: string;
  targetRect: DOMRect;
  preferredPlacement: Placement;
}

function getTooltipText(el: HTMLElement): string {
  return (
    el.getAttribute('data-tooltip') ||
    el.getAttribute('title') ||
    el.getAttribute('data-suppressed-title') ||
    ''
  ).trim();
}

function restoreNativeTitle(el: HTMLElement | null) {
  if (!el) return;
  const suppressed = el.getAttribute('data-suppressed-title');
  if (suppressed !== null) {
    if (!el.getAttribute('title')) {
      el.setAttribute('title', suppressed);
    }
    el.removeAttribute('data-suppressed-title');
  }
}

export function GlobalTooltipProvider() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: Placement } | null>(null);

  const activeTargetRef = useRef<HTMLElement | null>(null);
  const currentTextRef = useRef<string>('');
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastShownAtRef = useRef<number>(0);
  const tooltipBoxRef = useRef<HTMLDivElement | null>(null);

  const clearTimers = () => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const hideTooltipImmediate = () => {
    clearTimers();
    restoreNativeTitle(activeTargetRef.current);
    activeTargetRef.current = null;
    currentTextRef.current = '';
    setTooltip(null);
    setCoords(null);
  };

  useEffect(() => {
    const findTooltipHost = (rawTarget: EventTarget | null): HTMLElement | null => {
      if (!(rawTarget instanceof Element)) return null;
      const candidate = rawTarget.closest('[data-tooltip], [title], [data-suppressed-title]');
      if (!(candidate instanceof HTMLElement)) return null;
      if (candidate.tagName === 'IFRAME' || candidate.closest('[data-no-global-tooltip]')) return null;
      const txt = getTooltipText(candidate);
      if (!txt) return null;
      return candidate;
    };

    const scheduleShow = (host: HTMLElement) => {
      clearTimers();

      if (activeTargetRef.current && activeTargetRef.current !== host) {
        restoreNativeTitle(activeTargetRef.current);
      }
      activeTargetRef.current = host;

      const text = getTooltipText(host);
      if (!text) return;
      currentTextRef.current = text;

      // Suprime o title nativo do navegador enquanto o cursor estiver sobre o elemento
      const currentTitle = host.getAttribute('title');
      if (currentTitle) {
        host.setAttribute('data-suppressed-title', currentTitle);
        host.removeAttribute('title');
      }

      const insideAside = Boolean(host.closest('aside'));
      const rect = host.getBoundingClientRect();
      const preferredPlacement: Placement = insideAside
        ? 'right'
        : rect.top < 72 || Boolean(host.closest('header'))
          ? 'bottom'
          : 'top';

      const recentlyVisible = Date.now() - lastShownAtRef.current < 350;
      const delay = recentlyVisible ? 65 : 150;

      showTimerRef.current = window.setTimeout(() => {
        if (!document.contains(host)) {
          hideTooltipImmediate();
          return;
        }
        lastShownAtRef.current = Date.now();
        setTooltip({
          text,
          targetRect: host.getBoundingClientRect(),
          preferredPlacement,
        });
      }, delay);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const host = findTooltipHost(e.target);
      if (!host) {
        if (activeTargetRef.current) {
          hideTooltipImmediate();
        }
        return;
      }
      if (host === activeTargetRef.current) {
        const text = getTooltipText(host);
        if (text && currentTextRef.current !== text) {
          currentTextRef.current = text;
          setTooltip((prev) => (prev ? { ...prev, text, targetRect: host.getBoundingClientRect() } : prev));
        }
        return;
      }
      scheduleShow(host);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const current = activeTargetRef.current;
      if (!current) return;
      const next = e.relatedTarget instanceof Element ? findTooltipHost(e.relatedTarget) : null;
      if (next === current) return;
      if (e.relatedTarget instanceof Node && current.contains(e.relatedTarget)) {
        if (!next || next === current) return;
      }
      restoreNativeTitle(current);
      if (!next) {
        clearTimers();
        activeTargetRef.current = null;
        currentTextRef.current = '';
        hideTimerRef.current = window.setTimeout(() => {
          setTooltip(null);
          setCoords(null);
        }, 40);
      }
    };

    const handleDismiss = () => {
      if (activeTargetRef.current || currentTextRef.current) {
        hideTooltipImmediate();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideTooltipImmediate();
      }
    };

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('mousedown', handleDismiss, true);
    document.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('blur', handleDismiss);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimers();
      restoreNativeTitle(activeTargetRef.current);
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      document.removeEventListener('mousedown', handleDismiss, true);
      document.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('blur', handleDismiss);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipBoxRef.current) {
      setCoords(null);
      return;
    }

    const tipRect = tooltipBoxRef.current.getBoundingClientRect();
    const { targetRect, preferredPlacement } = tooltip;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let placement: Placement = preferredPlacement;
    let top = 0;
    let left = 0;

    if (placement === 'right') {
      left = targetRect.right + gap + 2;
      top = targetRect.top + targetRect.height / 2 - tipRect.height / 2;
      if (left + tipRect.width > vw - 8) {
        placement = targetRect.top > tipRect.height + 16 ? 'top' : 'bottom';
      }
    }

    if (placement === 'top') {
      left = targetRect.left + targetRect.width / 2 - tipRect.width / 2;
      top = targetRect.top - tipRect.height - gap;
      if (top < 8) {
        placement = 'bottom';
      }
    }

    if (placement === 'bottom') {
      left = targetRect.left + targetRect.width / 2 - tipRect.width / 2;
      top = targetRect.bottom + gap;
      if (top + tipRect.height > vh - 8) {
        top = Math.max(8, targetRect.top - tipRect.height - gap);
        placement = 'top';
      }
    }

    left = Math.max(8, Math.min(left, vw - tipRect.width - 8));
    top = Math.max(8, Math.min(top, vh - tipRect.height - 8));

    setCoords({ top, left, placement });
  }, [tooltip]);

  if (!tooltip || typeof document === 'undefined') return null;

  const placement = coords?.placement || tooltip.preferredPlacement;

  return createPortal(
    <div
      ref={tooltipBoxRef}
      role="tooltip"
      className={cn(
        'fixed z-[99999] pointer-events-none select-none print:hidden max-w-[290px] px-2.5 py-1.5 rounded-lg bg-[#091D22] text-slate-50 border border-teal-400/40 shadow-xl text-[11px] font-medium leading-snug tracking-normal transition-opacity duration-100',
        coords ? 'opacity-100' : 'opacity-0'
      )}
      style={
        coords
          ? { top: `${coords.top}px`, left: `${coords.left}px` }
          : { top: '-9999px', left: '-9999px' }
      }
    >
      <span>{tooltip.text}</span>
      {placement === 'right' && (
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-[#091D22] border-l border-b border-teal-400/40" />
      )}
    </div>,
    document.body
  );
}
