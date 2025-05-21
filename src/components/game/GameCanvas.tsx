
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER,
  COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
  COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  onPlayerAction?: (action: GameAction) => void;
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction?: GameAction | null;
  resetExecuteAction?: () => void;
}

// Helper function defined outside, as it doesn't depend on component state/props directly
const parseDimension = (dim: string | number, totalSize: number): number => {
    if (typeof dim === 'number') {
        return dim;
    }
    if (typeof dim === 'string') {
        if (dim.endsWith('%')) {
            return (parseFloat(dim) / 100) * totalSize;
        }
        if (dim.endsWith('px')) {
            return parseFloat(dim);
        }
        return parseFloat(dim); // Assume pixels if no unit
    }
    return 0;
};


export default function GameCanvas({
  levelPath,
  onPlayerAction, // Kept for eventual re-integration
  playerRef: parentPlayerRef, // Renamed to avoid conflict with internal playerRef
  executeAction,
  resetExecuteAction,
}: GameCanvasProps) {
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [assets, setAssets] = useState({
    playerImage: null as HTMLImageElement | null,
    playerImageLoaded: false,
    tileImage: null as HTMLImageElement | null,
    tileImageLoaded: false,
    coinImage: null as HTMLImageElement | null,
    coinImageLoaded: false,
    stoneImage: null as HTMLImageElement | null,
    stoneImageLoaded: false,
    tree1Image: null as HTMLImageElement | null,
    tree1ImageLoaded: false,
    tree2Image: null as HTMLImageElement | null,
    tree2ImageLoaded: false,
    smallBushImage: null as HTMLImageElement | null, // for flowers.png
    smallBushImageLoaded: false,
    largeBushImage: null as HTMLImageElement | null, // for bush1.png
    largeBushImageLoaded: false,
    houseImage: null as HTMLImageElement | null,
    houseImageLoaded: false,
  });

  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  const lastFrameTime = useRef<number>(Date.now());
  const executeActionRef = useRef<GameAction | null>(executeAction || null);

  // Refs for P3 platform movement
  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{startTime: number; startX: number; startY: number; targetX: number; targetY: number} | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);


  // const { toast } = useToast(); // Keep commented out for now

  // --- Helper Functions (to be wrapped in useCallback later if needed by effects) ---
  // processRawLevelData, spawnNewCoinPair, spawnSingleEnemy, gameLoop definitions
  // would go here, but they are not used yet in this step.

  // Effect 1: Set isClient and Load Assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    setIsClient(true);

    const allAssetPromises = [];

    const pImg = new Image();
    pImg.src = '/assets/images/hero_jeans3.png';
    pImg.setAttribute('data-ai-hint', 'player character jeans');
    allAssetPromises.push(new Promise<void>((resolve) => {
        pImg.onload = () => { setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true })); resolve(); };
        pImg.onerror = () => { console.error("Failed to load player image."); setAssets(prev => ({ ...prev, playerImageLoaded: true })); resolve(); };
    }));
    
    const tImg = new Image();
    tImg.src = '/assets/images/platform_grass.png';
    tImg.setAttribute('data-ai-hint', 'platform grass tile');
    allAssetPromises.push(new Promise<void>((resolve) => {
        tImg.onload = () => { setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true })); resolve(); };
        tImg.onerror = () => { console.error("Failed to load tile image."); setAssets(prev => ({ ...prev, tileImageLoaded: true })); resolve(); };
    }));

    const cImg = new Image();
    cImg.src = '/assets/images/thankscoin.png';
    cImg.setAttribute('data-ai-hint', 'collectible coin gold');
     allAssetPromises.push(new Promise<void>((resolve) => {
        cImg.onload = () => { setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true })); resolve(); };
        cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); resolve();};
    }));

    const stoneImg = new Image();
    stoneImg.src = '/assets/images/stone1.jpg';
    stoneImg.setAttribute('data-ai-hint', 'stone rock texture');
    allAssetPromises.push(new Promise<void>((resolve) => {
        stoneImg.onload = () => { setAssets(prev => ({ ...prev, stoneImage: stoneImg, stoneImageLoaded: true })); resolve(); };
        stoneImg.onerror = () => { console.error("Failed to load stone image."); setAssets(prev => ({ ...prev, stoneImageLoaded: true })); resolve(); };
    }));

    const tree1Img = new Image();
    tree1Img.src = '/assets/images/tree1.png';
    tree1Img.setAttribute('data-ai-hint', 'tree nature design');
    allAssetPromises.push(new Promise<void>((resolve) => {
        tree1Img.onload = () => { setAssets(prev => ({ ...prev, tree1Image: tree1Img, tree1ImageLoaded: true })); resolve(); };
        tree1Img.onerror = () => { console.error("Failed to load tree1 image."); setAssets(prev => ({ ...prev, tree1ImageLoaded: true })); resolve(); };
    }));
    
    const tree2Img = new Image();
    tree2Img.src = '/assets/images/tree2.png';
    tree2Img.setAttribute('data-ai-hint', 'tree nature outline');
     allAssetPromises.push(new Promise<void>((resolve) => {
        tree2Img.onload = () => { setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true })); resolve(); };
        tree2Img.onerror = () => { console.error("Failed to load tree2 image."); setAssets(prev => ({ ...prev, tree2ImageLoaded: true })); resolve(); };
    }));

    const flowersImg = new Image(); // For small bushes
    flowersImg.src = '/assets/images/flowers.png';
    flowersImg.setAttribute('data-ai-hint', 'flowers small bush');
    allAssetPromises.push(new Promise<void>((resolve) => {
        flowersImg.onload = () => { setAssets(prev => ({ ...prev, smallBushImage: flowersImg, smallBushImageLoaded: true })); resolve(); };
        flowersImg.onerror = () => { console.error("Failed to load flowers image."); setAssets(prev => ({ ...prev, smallBushImageLoaded: true })); resolve(); };
    }));

    const bush1Img = new Image(); // For large bushes
    bush1Img.src = '/assets/images/bush1.png';
    bush1Img.setAttribute('data-ai-hint', 'bush large green');
    allAssetPromises.push(new Promise<void>((resolve) => {
        bush1Img.onload = () => { setAssets(prev => ({ ...prev, largeBushImage: bush1Img, largeBushImageLoaded: true })); resolve(); };
        bush1Img.onerror = () => { console.error("Failed to load bush1 image."); setAssets(prev => ({ ...prev, largeBushImageLoaded: true })); resolve(); };
    }));

    const house1Img = new Image();
    house1Img.src = '/assets/images/house1.png';
    house1Img.setAttribute('data-ai-hint', 'house building facade');
    allAssetPromises.push(new Promise<void>((resolve) => {
        house1Img.onload = () => { setAssets(prev => ({ ...prev, houseImage: house1Img, houseImageLoaded: true })); resolve(); };
        house1Img.onerror = () => { console.error("Failed to load house1 image."); setAssets(prev => ({ ...prev, houseImageLoaded: true })); resolve(); };
    }));
    
    Promise.all(allAssetPromises).then(() => {
        console.log("[GameCanvas Effect 1] All asset loading attempts completed.");
    });

  }, []); // Runs once on mount

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    const canvas = canvasRef.current;
    if (canvas) {
      if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
      if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;
    }
  }, [canvasSize]);

  // Effect 3: Observe parent size
  useEffect(() => {
    console.log("[GameCanvas Effect 3] Running: Observe parent size");
    const canvas = canvasRef.current;
    if (!canvas || !isClient) return;

    const updateCanvasSizeState = (entries?: ResizeObserverEntry[]) => {
      const parent = canvas.parentElement;
      if (parent) {
        const newWidth = parent.clientWidth > 0 ? parent.clientWidth : 0;
        const newHeight = parent.clientHeight > 0 ? parent.clientHeight : 0;
        console.log(`[GameCanvas Effect 3 updateCanvasSizeState] newWidth: ${newWidth}, newHeight: ${newHeight}`);
        setCanvasSize(currentSize => {
          if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
            console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            return { width: newWidth, height: newHeight };
          }
          return currentSize;
        });
      }
    };

    updateCanvasSizeState(); // Initial size update

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateCanvasSizeState);
      if (canvas.parentElement) {
        resizeObserver.observe(canvas.parentElement);
      }
    } else {
      window.addEventListener('resize', updateCanvasSizeState);
    }

    return () => {
      if (resizeObserver && canvas.parentElement) {
        resizeObserver.unobserve(canvas.parentElement);
      } else {
        window.removeEventListener('resize', updateCanvasSizeState);
      }
    };
  }, [isClient]);


  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    
    // setIsLoading(true); // This will be handled by Effect 7
    setRawLevelData(null); // Clear previous level data

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}`);
          setRawLevelData(null);
          // setIsLoading(false); // Allow render of "error" or "empty" state
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
        // setIsLoading(false);
      });
  }, [isClient, levelPath]);


  // Effects 5, 7, 8, 9 and gameLoop are NOT restored yet.
  // Diagnostic rendering:
  useEffect(() => {
      if (isClient && canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              if (canvas.width > 0 && canvas.height > 0) { // Only draw if canvas has dimensions
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'red';
                ctx.fillRect(10, 10, 100, 50); // Draw a visible red rectangle
                console.log("[GameCanvas Diagnostic Draw] Red rectangle drawn on canvas.");
              } else {
                console.log("[GameCanvas Diagnostic Draw] Canvas has no dimensions, not drawing red rectangle.");
              }
          }
      }
  }, [isClient, canvasSize]); // Re-draw if canvasSize changes, for testing


  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);

  // Simplified return for now
  if (!isClient) {
    return <div className="w-full h-full flex items-center justify-center bg-muted/20"><p>GameCanvas waiting for client...</p></div>;
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block outline-none" // Ensure it takes up space and has default styling
      // width and height attributes are set by Effect 2 based on canvasSize state
    >
      Your browser does not support the HTML5 canvas tag.
    </canvas>
  );
}

