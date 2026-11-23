import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { API_ORIGIN } from '@/lib/apiBase';

/**
 * Cross-user React Query cache invalidation.
 *
 * A write from another user (or another tab of the same user) must not leave
 * an open transfers/purchases/purchase-orders/GRN/delivery-notes/quotations/
 * credit-notes/pick-packs screen showing a status or quantity that has
 * already changed elsewhere. The backend broadcasts `orders:changed`
 * (`{ domain }`) and `stock:changed` to every socket in the acting user's
 * company room after a commit (see
 * Stock_tenancy_system/lib/realtimeEvents.js). This hook keeps one shared
 * socket connection alive for the app and invalidates the matching React
 * Query root key so the next render — or the currently visible screen, since
 * `useQuery` re-renders on invalidation — reflects the change without
 * polling.
 *
 * `domain` values are the same root query keys used by the migrated list
 * screens: 'transfers', 'purchases', 'purchaseOrders', 'grn',
 * 'deliveryNotes', 'quotations', 'creditNotes', 'pickPacks'.
 */

let sharedSocket: Socket | null = null;
let sharedSocketToken: string | null = null;

function getSharedSocket(): Socket | null {
  const token = sessionStorage.getItem('token');
  if (!token) return null;

  // Re-create the connection if the signed-in identity changed (e.g. logout
  // then a different company/user login in the same tab).
  if (sharedSocket && sharedSocketToken !== token) {
    try {
      sharedSocket.disconnect();
    } catch {
      // ignore
    }
    sharedSocket = null;
  }

  if (!sharedSocket) {
    sharedSocket = io(API_ORIGIN || window.location.origin, {
      auth: (callback: (data: object) => void) => {
        callback({ token: sessionStorage.getItem('token') || '' });
      },
    });
    sharedSocketToken = token;
  }
  return sharedSocket;
}

export function getRestaurantRealtimeSocket(): Socket | null {
  return getSharedSocket();
}

export function useCrossUserCacheSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSharedSocket();
    if (!socket) return;

    const handleOrdersChanged = (payload?: { domain?: string }) => {
      const domain = payload?.domain;
      if (!domain) return;
      void queryClient.invalidateQueries({ queryKey: [domain] });
    };
    const handleStockChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    };

    socket.on('orders:changed', handleOrdersChanged);
    socket.on('stock:changed', handleStockChanged);

    return () => {
      socket.off('orders:changed', handleOrdersChanged);
      socket.off('stock:changed', handleStockChanged);
    };
  }, [queryClient]);
}
