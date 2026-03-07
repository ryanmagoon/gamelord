import React, { useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gamelord/ui';
import { FolderOpen, Search, Plus, HardDrive, Gamepad2, RefreshCw } from 'lucide-react';
import { GameSystem } from '../../types/library';

interface EmptyLibraryProps {
  onAddSystem: (system: GameSystem) => void;
  onScanDirectory: () => void;
  onQuickScan: () => void;
  availableSystems: GameSystem[];
  /** True when homebrew import is still in progress. */
  isImportingHomebrew?: boolean;
}

export const EmptyLibrary: React.FC<EmptyLibraryProps> = ({
  onAddSystem,
  onScanDirectory,
  onQuickScan,
  availableSystems,
  isImportingHomebrew,
}) => {
  const [showSystemList, setShowSystemList] = useState(false);

  if (isImportingHomebrew) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="text-center">
          <Gamepad2 className="h-12 w-12 mx-auto mb-4 text-primary animate-pulse" />
          <h2 className="text-2xl font-bold mb-2">Setting up your library</h2>
          <p className="text-muted-foreground">
            Importing bundled homebrew games...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div className="text-center mb-8">
        <Gamepad2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <h2 className="text-3xl font-bold mb-2">Your library is empty</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Add your ROMs to get started. GameLord supports NES, SNES, Genesis,
          Game Boy, GBA, N64, PS1, PSP, DS, Saturn, and Arcade.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow group" onClick={onQuickScan}>
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
              <Search className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Quick Scan</CardTitle>
            <CardDescription>
              Scan your ~/ROMs folder. Create subfolders by system name
              (NES, SNES, Genesis, etc.) and drop your ROMs inside.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow group" onClick={onScanDirectory}>
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Choose Folder</CardTitle>
            <CardDescription>
              Point to any folder containing ROMs. Files are matched by
              extension — no need to rename anything.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-shadow group"
          onClick={() => setShowSystemList(!showSystemList)}
        >
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Add System</CardTitle>
            <CardDescription>
              Set up a specific system and assign its ROM folder manually.
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
