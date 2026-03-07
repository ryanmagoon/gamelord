import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMenuEvents } from './useMenuEvents';
import type { GamelordAPI } from '../types/global';

describe('useMenuEvents', () => {
  let listeners: Record<string, (...args: unknown[]) => void>;
  let mockApi: GamelordAPI;

  beforeEach(() => {
    listeners = {};
    mockApi = {
      on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
        listeners[channel] = callback;
      }),
      removeAllListeners: vi.fn((channel: string) => {
        delete listeners[channel];
      }),
    } as unknown as GamelordAPI;
  });

  it('subscribes to all three menu channels on mount', () => {
    const handlers = {
      onScanLibrary: vi.fn(),
      onAddRomFolder: vi.fn(),
      onOpenSettings: vi.fn(),
    };

    renderHook(() => useMenuEvents(mockApi, handlers));

    expect(mockApi.on).toHaveBeenCalledWith('menu:scanLibrary', handlers.onScanLibrary);
    expect(mockApi.on).toHaveBeenCalledWith('menu:addRomFolder', handlers.onAddRomFolder);
    expect(mockApi.on).toHaveBeenCalledWith('menu:openSettings', handlers.onOpenSettings);
  });

  it('removes all listeners on unmount', () => {
    const handlers = {
      onScanLibrary: vi.fn(),
      onAddRomFolder: vi.fn(),
      onOpenSettings: vi.fn(),
    };

    const { unmount } = renderHook(() => useMenuEvents(mockApi, handlers));
    unmount();

    expect(mockApi.removeAllListeners).toHaveBeenCalledWith('menu:scanLibrary');
    expect(mockApi.removeAllListeners).toHaveBeenCalledWith('menu:addRomFolder');
    expect(mockApi.removeAllListeners).toHaveBeenCalledWith('menu:openSettings');
  });

  it('calls the correct handler when a menu event fires', () => {
    const handlers = {
      onScanLibrary: vi.fn(),
      onAddRomFolder: vi.fn(),
      onOpenSettings: vi.fn(),
    };

    renderHook(() => useMenuEvents(mockApi, handlers));

    listeners['menu:scanLibrary']();
    expect(handlers.onScanLibrary).toHaveBeenCalledOnce();

    listeners['menu:addRomFolder']();
    expect(handlers.onAddRomFolder).toHaveBeenCalledOnce();

    listeners['menu:openSettings']();
    expect(handlers.onOpenSettings).toHaveBeenCalledOnce();
  });
});
