import React from 'react';
import { Game } from './GameCard';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { 
  Play, 
  Settings, 
  Clock, 
  Calendar, 
  HardDrive,
  Info
} from 'lucide-react';
import { PlatformIcon } from './PlatformIcon';
import { cn } from '../utils';

export interface GameDetailsProps {
  game: Game;
  onPlay: (game: Game) => void;
  onSettings?: (game: Game) => void;
  className?: string;
}

export const GameDetails: React.FC<GameDetailsProps> = ({
  game,
  onPlay,
  onSettings,
  className
}) => {
  const formatPlayTime = (seconds?: number) => {
    if (!seconds) return 'Never played';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatLastPlayed = (date?: Date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header with cover art and basic info */}
      <div className="flex gap-6">
        {/* Cover Art */}
        <div className="flex-shrink-0">
          <div className="w-48 h-64 bg-muted rounded-lg overflow-hidden">
            {game.coverArt ? (
              <img 
                src={game.coverArt} 
                alt={game.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Info className="h-12 w-12" />
              </div>
            )}
          </div>
        </div>

        {/* Game Info */}
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{game.title}</h1>
            <div className="flex items-center gap-4 text-muted-foreground">
              <div className="flex items-center gap-2">
                <PlatformIcon platform={game.platform} className="h-5 w-5" />
                <span>{game.platform}</span>
              </div>
              {game.genre && (
                <Badge variant="secondary">{game.genre}</Badge>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button onClick={() => onPlay(game)} size="lg">
              <Play className="h-5 w-5 mr-2" />
              Play Now
            </Button>
            {onSettings && (
              <Button 
                variant="outline" 
                onClick={() => onSettings(game)}
                size="lg"
              >
                <Settings className="h-5 w-5 mr-2" />
                Settings
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Play Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPlayTime(game.playTime)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Played</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatLastPlayed(game.lastPlayed)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROM Path</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-mono truncate" title={game.romPath}>
              {game.romPath.split('/').pop()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Info */}
      <Card>
        <CardHeader>
          <CardTitle>About this game</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Game information will be displayed here once metadata services are integrated.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};