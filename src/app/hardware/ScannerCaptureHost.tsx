import { useEffect } from 'react';
import { useLocation } from 'react-router';
import {
  DEFAULT_SCANNER_SETTINGS,
  KeyboardScanDetector,
  playScannerFeedback,
  subscribeToScannerSettings,
  type ScanKeyResult,
  type ScannerSettings,
} from './scannerService';

function isPasswordTarget(target: HTMLElement): boolean {
  return target instanceof HTMLInputElement && target.type === 'password'
    || target.hasAttribute('data-pos-scan-protected');
}

function isEditableTarget(target: HTMLElement): boolean {
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, [role="textbox"]'));
}

function clearProtectedField(target: HTMLElement): void {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(target, '');
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

function publishScanResult(result: ScanKeyResult): void {
  if (result.kind === 'scan') {
    window.dispatchEvent(new CustomEvent('kubika:pos-scan', { detail: result.timing }));
  } else if (result.kind === 'invalid') {
    window.dispatchEvent(new CustomEvent('kubika:pos-scan-invalid', { detail: result }));
  }
}

export default function ScannerCaptureHost() {
  const { pathname } = useLocation();

  useEffect(() => {
    const detector = new KeyboardScanDetector();
    let activeSettings: ScannerSettings = DEFAULT_SCANNER_SETTINGS;
    const unsubscribe = subscribeToScannerSettings((settings) => {
      activeSettings = settings;
      detector.updateSettings(settings);
    });
    const handleScanFeedback = () => {
      if (activeSettings.feedbackSound) playScannerFeedback();
    };
    window.addEventListener('kubika:pos-scan', handleScanFeedback);
    const isPosRoute = pathname.startsWith('/pos/auth')
      || pathname.startsWith('/pos/till')
      || pathname.startsWith('/pos/printer-setup')
      || pathname.startsWith('/sales-legacy');

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : document.body;
      const protectedPassword = isPasswordTarget(target);
      if (!protectedPassword && !isPosRoute) return;

      const result = detector.handleKey(event, {
        protectedPassword,
        editable: !protectedPassword && isEditableTarget(target),
      });
      if (result.kind === 'swallow') {
        event.preventDefault();
        event.stopPropagation();
        if (result.clearProtectedField) clearProtectedField(target);
      } else if (result.kind === 'scan' || result.kind === 'invalid') {
        event.preventDefault();
        event.stopPropagation();
        publishScanResult(result);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('kubika:pos-scan', handleScanFeedback);
      unsubscribe();
    };
  }, [pathname]);

  return null;
}
