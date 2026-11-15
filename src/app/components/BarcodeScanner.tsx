import React, { useEffect, useRef, useState, useCallback } from 'react';

interface BarcodeScannerProps {
  onScan?: (result: string) => void;
  onError?: (error: string) => void;
  fps?: number;
  qrbox?: number;
  style?: React.CSSProperties;
  className?: string;
  enabled?: boolean;
}

/**
 * Mobile-optimized barcode scanner component
 * Supports camera-based scanning using html5-qrcode library
 */
export default function BarcodeScanner({
  onScan,
  onError,
  fps = 10,
  qrbox = 250,
  style,
  className = '',
  enabled = true
}: BarcodeScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startScanner = useCallback(async () => {
    if (!containerRef.current || !enabled) return;
    
    try {
      const mod = await import('html5-qrcode');
      const Html5Qrcode = mod.Html5Qrcode;
      
      // Use unique ID for each instance
      const elementId = `barcode_scanner_${Date.now()}`;
      containerRef.current.id = elementId;
      
      // Initialize scanner
      scannerRef.current = new Html5Qrcode(elementId);

      // Request camera with preference for back camera on mobile
      const config = { 
        fps, 
        qrbox: { width: qrbox, height: qrbox }
      };

      await scannerRef.current.start(
        { facingMode: 'environment' }, // Prefer back camera on mobile
        config,
        (decodedText: string) => {
          onScan?.(decodedText);
        },
        (errorMessage: string) => {
          // Ignore QR code parse errors (no QR code in frame)
          if (!errorMessage.includes('NotFoundException')) {
            console.debug('Scanner error:', errorMessage);
          }
        }
      );

      setIsScanning(true);
      setHasPermission(true);
      setError(null);
    } catch (err: any) {
      console.error('Failed to start scanner:', err);
      
      let errorMessage = 'Failed to access camera';
      const errStr = err?.toString() || '';
      
      if (errStr.includes('NotAllowedError') || errStr.includes('Permission')) {
        errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
        setHasPermission(false);
      } else if (errStr.includes('NotFoundError') || errStr.includes('not found')) {
        errorMessage = 'No camera found on this device.';
      } else if (errStr.includes('NotReadableError') || errStr.includes('in use')) {
        errorMessage = 'Camera is already in use by another application.';
      }
      
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [enabled, fps, qrbox, onScan, onError]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.debug('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // Start/stop scanner based on enabled prop
  useEffect(() => {
    if (enabled) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [enabled, startScanner, stopScanner]);

  // Handle visibility change - pause when hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isScanning) {
        stopScanner();
      } else if (!document.hidden && enabled && !isScanning) {
        startScanner();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, isScanning, startScanner, stopScanner]);

  return (
    <div 
      className={`barcode-scanner-container ${className}`}
      style={{
        width: '100%',
        maxWidth: '500px',
        margin: '0 auto',
        ...style
      }}
    >
      {/* Scanner container */}
      <div 
        ref={containerRef}
        style={{
          width: '100%',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: '#000',
          minHeight: '300px'
        }}
      />
      
      {/* Status indicators */}
      {isScanning && (
        <div className="flex items-center justify-center gap-2 mt-3 text-sm text-green-600">
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Scanning...
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
          <button
            type="button"
            onClick={startScanner}
            className="mt-2 w-full py-2 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
      
      {/* Permission denied state */}
      {hasPermission === false && !error && (
        <div className="mt-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-center">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Camera access is required for barcode scanning.
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Please enable camera permissions in your browser settings and refresh the page.
          </p>
        </div>
      )}
    </div>
  );
}
