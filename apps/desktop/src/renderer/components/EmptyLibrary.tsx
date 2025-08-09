import React, { useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gamelord/ui';
import { FolderOpen, Search, Plus, HardDrive } from 'lucide-react';
import { GameSystem } from '../../types/library';

interface EmptyLibraryProps {
  onAddSystem: (system: GameSystem) => void;
  onScanDirectory: () => void;
  onQuickScan: () => void;
  availableSystems: GameSystem[];
}

export const EmptyLibrary: React.FC<EmptyLibraryProps> = ({
  onAddSystem,
  onScanDirectory,
  onQuickScan,
  availableSystems
}) => {
  const [showSystemList, setShowSystemList] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Welcome to GameLord</h2>
        <p className="text-muted-foreground">
          Get started by adding your first game system or scanning for ROMs
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={onQuickScan}>
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
              <Search className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Quick Scan</CardTitle>
            <CardDescription>
              Automatically scan your home ROMs folder and detect systems
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={onScanDirectory}>
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Choose Folder</CardTitle>
            <CardDescription>
              Select a specific folder to scan for ROMs
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow" 
          onClick={() => setShowSystemList(!showSystemList)}
        >
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Add System</CardTitle>
            <CardDescription>
              Manually add a game system and configure its ROM folder
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {showSystemList && (
        <Card className="mt-8 max-w-4xl w-full">
          <CardHeader>
            <CardTitle>Choose a System</CardTitle>
            <CardDescription>
              Select a system to add to your library
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {availableSystems.map((system) => (
                <Button
                  key={system.id}
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    onAddSystem(system);
                    setShowSystemList(false);
                  }}
                >
                  <HardDrive className="h-4 w-4 mr-2" />
                  {system.shortName}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};