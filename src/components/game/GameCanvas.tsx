
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
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
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction?: GameAction | null;
  resetExecuteAction?: () => void;
}

// Helper function to parse dimension strings (like "100%" or "50px")
const parseDimension = (value: string | number, totalSize: number): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.endsWith('%')) {
      return (parseFloat(value) / 100) * totalSize;
    }
    if (value.endsWith('px')) {
      return parseFloat(value);
    }
  }
  return 0; // Default or error case
};


export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
}: GameCanvasProps) {
  console.log("[GameCanvas] Component body. levelPath:", levelPath);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Start with loading true
  const [assets, setAssets] = useState({
    playerImage: null as HTMLImageElement | null,
    tileImage: null as HTMLImageElement | null,
    coinImage: null as HTMLImageElement | null,
    stoneImage: null as HTMLImageElement | null,
    tree1Image: null as HTMLImageElement | null,
    tree2Image: null as HTMLImageElement | null,
    smallBushImage: null as HTMLImageElement | null,
    largeBushImage: null as HTMLImageElement | null,
    houseImage: null as HTMLImageElement | null,
    boatImage: null as HTMLImageElement | null,
    playerImageLoaded: false,
    tileImageLoaded: false,
    coinImageLoaded: false,
    stoneImageLoaded: false,
    tree1ImageLoaded: false,
    tree2ImageLoaded: false,
    smallBushImageLoaded: false,
    largeBushImageLoaded: false,
    houseImageLoaded: false,
    boatImageLoaded: false,
  });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);

  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{
    startTime: number;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
  } | null>(null);
  
  const lastFrameTime = useRef<number>(Date.now());
  const executeActionRef = useRef<GameAction | null>(executeAction || null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);

  // const { toast } = useToast(); // Commented out for now

  // Effect 1: Set isClient and load assets (Client-side only)
  useEffect(() => {
    console.log("[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state:", isClient);
    if (!isClient) {
      setIsClient(true);
    }

    // Player Image
    const pImg = new Image();
    pImg.src = '/assets/images/hero_jeans3.png';
    pImg.setAttribute('data-ai-hint', 'character orange blue');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => { console.error("Failed to load player image."); setAssets(prev => ({ ...prev, playerImageLoaded: true })); };

    // Tile Image (for platforms)
    const tImg = new Image();
    tImg.src = '/assets/images/platform_grass.png';
    tImg.setAttribute('data-ai-hint', 'platform grass dirt');
    tImg.onload = () => setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true }));
    tImg.onerror = () => { console.error("Failed to load platform_grass image."); setAssets(prev => ({ ...prev, tileImageLoaded: true })); };
    
    // Coin Image
    const cImg = new Image();
    cImg.src = '/assets/images/thankscoin.png';
    cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); };

    // Stone Image
    const stoneImg = new Image();
    stoneImg.src = '/assets/images/stone1.jpg';
    stoneImg.setAttribute('data-ai-hint', 'stone rock');
    stoneImg.onload = () => setAssets(prev => ({ ...prev, stoneImage: stoneImg, stoneImageLoaded: true }));
    stoneImg.onerror = () => { console.error("Failed to load stone image."); setAssets(prev => ({ ...prev, stoneImageLoaded: true })); };
    
    // Tree1 Image (for specific tree type)
    const tree1Img = new Image();
    tree1Img.src = '/assets/images/tree1.png';
    tree1Img.setAttribute('data-ai-hint', 'tree nature large');
    tree1Img.onload = () => setAssets(prev => ({ ...prev, tree1Image: tree1Img, tree1ImageLoaded: true }));
    tree1Img.onerror = () => { console.error("Failed to load tree1 image."); setAssets(prev => ({ ...prev, tree1ImageLoaded: true })); };

    // Tree2 Image (for another specific tree type)
    const tree2Img = new Image();
    tree2Img.src = '/assets/images/tree2.png'; 
    tree2Img.setAttribute('data-ai-hint', 'tree nature');
    tree2Img.onload = () => setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true }));
    tree2Img.onerror = () => { console.error("Failed to load tree2 image."); setAssets(prev => ({ ...prev, tree2ImageLoaded: true })); };

    // Small Bush Image (flowers.png)
    const sbImg = new Image();
    sbImg.src = '/assets/images/flowers.png';
    sbImg.setAttribute('data-ai-hint', 'flowers small');
    sbImg.onload = () => setAssets(prev => ({ ...prev, smallBushImage: sbImg, smallBushImageLoaded: true }));
    sbImg.onerror = () => { console.error("Failed to load small bush (flowers) image."); setAssets(prev => ({ ...prev, smallBushImageLoaded: true })); };

    // Large Bush Image (bush1.png)
    const lbImg = new Image();
    lbImg.src = '/assets/images/bush1.png';
    lbImg.setAttribute('data-ai-hint', 'bush large');
    lbImg.onload = () => setAssets(prev => ({ ...prev, largeBushImage: lbImg, largeBushImageLoaded: true }));
    lbImg.onerror = () => { console.error("Failed to load large bush (bush1) image."); setAssets(prev => ({ ...prev, largeBushImageLoaded: true })); };
    
    // House Image (house1.png)
    const hImg = new Image();
    hImg.src = '/assets/images/house1.png';
    hImg.setAttribute('data-ai-hint', 'house building');
    hImg.onload = () => setAssets(prev => ({ ...prev, houseImage: hImg, houseImageLoaded: true }));
    hImg.onerror = () => { console.error("Failed to load house image."); setAssets(prev => ({ ...prev, houseImageLoaded: true })); };

  }, [isClient]); // Run once on client mount


  // Effect 2: Apply canvasSize to canvas attributes (Client-side only)
  useEffect(() => {
    console.log("[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize:", canvasSize);
    if (isClient && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width} H:${canvasSize.height}`);
    }
  }, [isClient, canvasSize]);

  // Effect 3: Observe parent size (Client-side only)
  useEffect(() => {
    console.log("[GameCanvas Effect 3] Running: Observe parent size");
    if (!isClient || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const parentElement = canvas.parentElement;

    if (!parentElement) return;

    const updateCanvasSizeState = (newWidth: number, newHeight: number) => {
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
          return { width: newWidth, height: newHeight };
        }
        return currentSize;
      });
    };
    
    const initialWidth = parentElement.clientWidth || 0;
    const initialHeight = parentElement.clientHeight || 0;
    console.log(`[GameCanvas Effect 3] Initial parent dimensions: W:${initialWidth} H:${initialHeight}`);
    if (initialWidth > 0 && initialHeight > 0) {
        updateCanvasSizeState(initialWidth, initialHeight);
    }


    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(entries => {
        if (!entries || entries.length === 0) return;
        const entry = entries[0];
        const newWidth = Math.max(0, entry.contentRect.width);
        const newHeight = Math.max(0, entry.contentRect.height);
        console.log(`[GameCanvas Effect 3 ResizeObserver] newWidth: ${newWidth}, newHeight: ${newHeight}`);
        updateCanvasSizeState(newWidth, newHeight);
      });
      resizeObserver.observe(parentElement);
    } else {
      // Fallback for older browsers
      const handleResize = () => {
        const newWidth = parentElement.clientWidth || 0;
        const newHeight = parentElement.clientHeight || 0;
        console.log(`[GameCanvas Effect 3 window.resize] newWidth: ${newWidth}, newHeight: ${newHeight}`);
        updateCanvasSizeState(newWidth, newHeight);
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isClient]);


  // Effect 4: Load raw level data (Client-side only)
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    setRawLevelData(null); // Clear previous level data
    // setIsLoading(true); // Initiate loading state for new level

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, data is null.`);
          setRawLevelData(null); // Ensure it's null on failure
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [isClient, levelPath]);


  // --- START: Logic to be restored in subsequent steps ---
  // const processRawLevelData = useCallback(...)
  // const spawnNewCoinPair = useCallback(...)
  // const spawnSingleEnemy = useCallback(...)
  // const gameLoop = useCallback(...)

  // Effect 5: Process raw level data (when rawLevelData or canvasSize changes)
  // useEffect(() => { ... setProcessedLevel ...  }, [isClient, rawLevelData, canvasSize, assets, processRawLevelData, ...]);

  // Effect 6: Update processedLevelRef when processedLevel state changes
  // useEffect(() => { ... processedLevelRef.current = processedLevel ... }, [processedLevel]);

  // Effect 7: Spawn entities and finish loading
  // useEffect(() => { ... setIsLoading(false) ... }, [isClient, isLoading, processedLevel, canvasSize, levelPath, ...]);
  
  // Effect 8: Check coin respawn
  // useEffect(() => { ... spawnNewCoinPair ... }, [activeCoins, isClient, isLoading, canvasSize, processedLevel, ...]);

  // Effect 9: Game Loop Setup
  // useEffect(() => { ... requestAnimationFrame ... }, [isClient, isLoading, canvasSize, processedLevelRef, gameLoop]);
  // --- END: Logic to be restored ---


  // Simplified render for diagnostics
  useEffect(() => {
    if (isClient && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            console.log("[GameCanvas Diagnostic Draw] Drawing red rectangle on canvas.");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'red';
            ctx.fillRect(20, 20, 100, 50); // Draw a visible red square
            ctx.font = "12px Arial";
            ctx.fillStyle = "black";
            ctx.fillText("Simplified Canvas OK", 25, 45);
        } else {
            console.error("[GameCanvas Diagnostic Draw] Failed to get 2D context.");
        }
    } else {
         console.log("[GameCanvas Diagnostic Draw] Conditions not met for drawing red rectangle.");
    }
  }, [isClient, canvasSize]); // Re-run if isClient or canvasSize changes


  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  
  // For now, always render the canvas. Loading state from PlatformerPage will handle initial "Initializing..."
  return (
    <canvas
      ref={canvasRef}
      // Fallback dimensions, will be overridden by JS
      width={canvasSize.width || 300} 
      height={canvasSize.height || 150}
      className="border-4 border-green-500 bg-white" // Visible border and background for diagnostics
      tabIndex={0} // For keyboard events if needed directly on canvas
    />
  );
}


    