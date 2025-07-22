import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function App() {
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
              <div className="aspect-[3/4] bg-muted rounded-md mb-4"></div>
              <div className="flex gap-2 mb-4">
                <Badge variant="secondary">NES</Badge>
                <Badge variant="outline">Action</Badge>
              </div>
              <Button className="w-full">Play</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default App;