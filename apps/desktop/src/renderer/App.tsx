import React, { useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, WebGLRendererComponent } from '@gamelord/ui';
import { useWebGLRenderer } from './hooks/useWebGLRenderer';
import { Monitor, Tv } from 'lucide-react';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const { isReady, currentShader, handleRendererReady, changeShader } = useWebGLRenderer();

  const handlePlay = async () => {
    try {
      // For now, just simulate loading a core
      const result = await window.gamelord.core.load({
        corePath: '/path/to/core.so',
        romPath: '/path/to/rom.nes'
      });
      
      if (result.success) {
        setIsPlaying(true);
      } else {
        console.error('Failed to load core:', result.error);
      }
    } catch (error) {
      console.error('Error loading game:', error);
    }
  };

  const handleStop = async () => {
    try {
      await window.gamelord.core.unload();
      setIsPlaying(false);
    } catch (error) {
      console.error('Error unloading core:', error);
    }
  };

  if (isPlaying) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-2xl font-bold">GameLord</h1>
          <div className="flex gap-2">
            <Button
              variant={currentShader === 'default' ? 'default' : 'outline'}
              size="sm"
              onClick={() => changeShader('default')}
            >
              <Monitor className="h-4 w-4 mr-2" />
              Default
            </Button>
            <Button
              variant={currentShader === 'crt' ? 'default' : 'outline'}
              size="sm"
              onClick={() => changeShader('crt')}
            >
              <Tv className="h-4 w-4 mr-2" />
              CRT
            </Button>
            <Button variant="destructive" size="sm" onClick={handleStop}>
              Stop
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <WebGLRendererComponent
            className="h-full"
            onReady={handleRendererReady}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-2">GameLord</h1>
        <p className="text-muted-foreground mb-8">Modern Emulation Frontend</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Example Game</CardTitle>
              <CardDescription>Nintendo Entertainment System</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-[3/4] bg-muted rounded-md mb-4 flex items-center justify-center">
                <span className="text-muted-foreground">No Cover Art</span>
              </div>
              <div className="flex gap-2 mb-4">
                <Badge variant="secondary">NES</Badge>
                <Badge variant="outline">Action</Badge>
              </div>
              <Button className="w-full" onClick={handlePlay}>Play</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default App;