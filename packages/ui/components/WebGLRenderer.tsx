import React, { useRef, useEffect, useCallback } from 'react';
import { WebGLRenderer } from '../webgl/WebGLRenderer';
import { cn } from '../utils';

interface WebGLRendererProps {
  className?: string;
  onReady?: () => void;
}

export const WebGLRendererComponent: React.FC<WebGLRendererProps> = ({ 
  className, 
  onReady 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize WebGL renderer
    try {
      rendererRef.current = new WebGLRenderer(canvasRef.current);
      rendererRef.current.initialize();
      onReady?.();
    } catch (error) {
      console.error('Failed to initialize WebGL renderer:', error);
    }

    // Set up video frame listener
    const handleVideoFrame = (frame: any) => {
      if (rendererRef.current && frame.data) {
        rendererRef.current.renderFrame(frame);
      }
    };

    window.gamelord.on('video:frame', handleVideoFrame);

    // Handle resize
    const handleResize = () => {
      if (rendererRef.current && canvasRef.current) {
        const parent = canvasRef.current.parentElement;
        if (parent) {
          canvasRef.current.width = parent.clientWidth;
          canvasRef.current.height = parent.clientHeight;
          rendererRef.current.resize(parent.clientWidth, parent.clientHeight);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial size

    return () => {
      window.removeEventListener('resize', handleResize);
      window.gamelord.removeAllListeners('video:frame');
      rendererRef.current?.destroy();
    };
  }, [onReady]);

  const handleFullscreen = useCallback(() => {
    if (canvasRef.current) {
      if (canvasRef.current.requestFullscreen) {
        canvasRef.current.requestFullscreen();
      }
    }
  }, []);

  return (
    <div className={cn("relative bg-black", className)}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onDoubleClick={handleFullscreen}
      />
    </div>
  );
};