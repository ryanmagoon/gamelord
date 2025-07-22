import { useState, useCallback, useRef } from 'react';
import { WebGLRenderer } from '../lib/webgl/WebGLRenderer';

export type ShaderType = 'default' | 'crt';

export function useWebGLRenderer() {
  const [isReady, setIsReady] = useState(false);
  const [currentShader, setCurrentShader] = useState<ShaderType>('default');
  const rendererRef = useRef<WebGLRenderer | null>(null);

  const handleRendererReady = useCallback(() => {
    setIsReady(true);
  }, []);

  const setRenderer = useCallback((renderer: WebGLRenderer | null) => {
    rendererRef.current = renderer;
  }, []);

  const changeShader = useCallback((shader: ShaderType) => {
    if (rendererRef.current) {
      rendererRef.current.setShader(shader);
      setCurrentShader(shader);
    }
  }, []);

  const toggleFullscreen = useCallback((canvas: HTMLCanvasElement) => {
    if (!document.fullscreenElement) {
      canvas.requestFullscreen().catch(err => {
        console.error('Failed to enter fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  return {
    isReady,
    currentShader,
    handleRendererReady,
    setRenderer,
    changeShader,
    toggleFullscreen
  };
}