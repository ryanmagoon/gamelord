import React from 'react'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { cn } from '../utils'
import { Play, MoreVertical } from 'lucide-react'

export interface Game {
  id: string
  title: string
  platform: string
  genre?: string
  coverArt?: string
  romPath: string
  lastPlayed?: Date
  playTime?: number
}

export interface GameCardProps {
  game: Game
  onPlay: (game: Game) => void
  onOptions?: (game: Game) => void
  className?: string
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onPlay,
  onOptions,
  className,
}) => {
  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault()
    onPlay(game)
  }

  const handleOptions = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onOptions?.(game)
  }

  return (
    <Card
      className={cn(
        'group relative overflow-hidden rounded-md transition-all hover:scale-105 hover:shadow-lg',
        className
      )}
    >
      <CardContent className="p-0">
        <div className="border-red-500 aspect-[3/4] relative bg-muted">
          {game.coverArt ? (
            <img
              src={game.coverArt}
              alt={game.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <span className="text-xs">No Cover</span>
            </div>
          )}

          {/* Always visible overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-white font-semibold text-sm mb-2 line-clamp-2">
                {game.title}
              </h3>
              <div className="flex gap-2 mb-3">
                <Badge variant="secondary" className="text-xs">
                  {game.platform}
                </Badge>
                {game.genre && (
                  <Badge
                    variant="outline"
                    className="text-xs text-white border-white/30"
                  >
                    {game.genre}
                  </Badge>
                )}
              </div>
              <Button onClick={handlePlay} size="sm" className="w-full" aria-label={`Play ${game.title}`}>
                <Play className="h-3 w-3 mr-1" />
                Play
              </Button>
            </div>
          </div>

          {/* Options button */}
          {onOptions && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity bg-black/50 hover:bg-black/70 text-white"
              onClick={handleOptions}
              aria-label={`Options for ${game.title}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
