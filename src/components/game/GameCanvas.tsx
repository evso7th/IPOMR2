
"use client";

import type { ReactNode } from 'react';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, COIN_PARTICLE_COUNT,
  COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR,
  COIN_PARTICLE_SIZE, ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR,
  PLATFORM_SPEED, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
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
  onPlayerAction: (action: GameAction) => void;
  playerRef: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
}

export default function GameCanvas({ levelPath, onPlayerAction, playerRef: parentPlayerRef, executeAction, resetExecuteAction }: GameCanvasProps) {
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // const { toast } = useToast();

  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);

  const playerInstanceRef = useRef<PlayerState | null>(null);
  const executeActionRef = useRef<GameAction | null>(null);
  const lastFrameTime = useRef<number>(Date.now());

  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);

  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const [assets, setAssets] = useState<{
    playerImage: HTMLImageElement | null;
    tileImage: HTMLImageElement | null;
    coinImage: HTMLImageElement | null;
    stoneImage: HTMLImageElement | null;
    treeImage: HTMLImageElement | null; // For tree1
    tree2Image: HTMLImageElement | null; // For tree2
    flowerImage: HTMLImageElement | null; // For bush1 (flowers)
    smallBushImage: HTMLImageElement | null; // For small bushes (uses flowers.png)
    largeBushImage: HTMLImageElement | null; // For large bushes (uses bush1.png)
    houseImage: HTMLImageElement | null; // For house1
    playerImageLoaded: boolean;
    tileImageLoaded: boolean;
    coinImageLoaded: boolean;
    stoneImageLoaded: boolean;
    treeImageLoaded: boolean;
    tree2ImageLoaded: boolean;
    flowerImageLoaded: boolean;
    smallBushImageLoaded: boolean;
    largeBushImageLoaded: boolean;
    houseImageLoaded: boolean;
  }>({
    playerImage: null, tileImage: null, coinImage: null, stoneImage: null, treeImage: null, tree2Image: null, flowerImage: null, smallBushImage: null, largeBushImage: null, houseImage: null,
    playerImageLoaded: false, tileImageLoaded: false, coinImageLoaded: false, stoneImageLoaded: false, treeImageLoaded: false, tree2ImageLoaded: false, flowerImageLoaded: false, smallBushImageLoaded: false, largeBushImageLoaded: false, houseImageLoaded: false,
  });

  // Refs for P3 platform movement (level 2 specific, but refs are fine to keep)
  const p3BasePosRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<{ x: number; y: number }[]>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);


  const parseDimension = useCallback((dim: string | number, totalSize: number): number => {
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
      return parseFloat(dim);
    }
    console.warn(`[parseDimension] Invalid dimension value: ${dim}, returning 0.`);
    return 0;
  }, []);

  const processRawLevelData = useCallback(
    (currentRawLevelData: RawLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): ProcessedLevelData | null => {
      console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
      if (!currentRawLevelData || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        console.warn("[GameCanvas processRawLevelData] Invalid input (no raw data or zero canvas dimensions), returning null.");
        return null;
      }

      const processedTiles: ProcessedTile[] = [];
      let playerStartX = PLAYER_WIDTH * 2;
      let playerStartY = currentCanvasHeight - PLAYER_HEIGHT - 100; // Default if not specified

      const { tiles: rawTiles, playerStart: rawPlayerStart } = currentRawLevelData;

      rawTiles.forEach(rawTile => {
        const tileWidth = parseDimension(rawTile.width, currentCanvasWidth);
        const tileHeight = parseDimension(rawTile.height, currentCanvasHeight);
        let tileX = 0;
        let tileY = 0;

        const xOffset = rawTile.positioning.xOffsetPx || 0;
        const yOffset = rawTile.positioning.yOffsetPx || 0;

        switch (rawTile.positioning.anchor) {
          case 'top-left': tileX = xOffset; tileY = yOffset; break;
          case 'top-center': tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset; tileY = yOffset; break;
          case 'top-right': tileX = currentCanvasWidth - tileWidth - xOffset; tileY = yOffset; break;
          case 'center-left': tileX = xOffset; tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset; break;
          case 'center': tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset; tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset; break;
          case 'center-right': tileX = currentCanvasWidth - tileWidth - xOffset; tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset; break;
          case 'bottom-left': tileX = xOffset; tileY = currentCanvasHeight - tileHeight - yOffset; break;
          case 'bottom-center': tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset; tileY = currentCanvasHeight - tileHeight - yOffset; break;
          case 'bottom-right': tileX = currentCanvasWidth - tileWidth - xOffset; tileY = currentCanvasHeight - tileHeight - yOffset; break;
          default: console.warn(`[processRawLevelData] Unknown anchor: ${rawTile.positioning.anchor} for tile ${rawTile.id}. Defaulting to top-left.`); tileX = xOffset; tileY = yOffset;
        }

        const newTile: ProcessedTile = {
          id: rawTile.id, x: tileX, y: tileY, width: tileWidth, height: tileHeight,
          type: rawTile.type, color: rawTile.color, vx: rawTile.vx, direction: rawTile.direction, layer: rawTile.layer,
        };
        processedTiles.push(newTile);

        if (rawPlayerStart && rawTile.id === rawPlayerStart.platformId) {
          playerStartY = newTile.y - PLAYER_HEIGHT - (rawPlayerStart.yOffsetPx || 0);
          switch (rawPlayerStart.horizontalAlign) {
            case 'left': playerStartX = newTile.x + (rawPlayerStart.xOffsetPx || 0); break;
            case 'center': playerStartX = newTile.x + (newTile.width / 2) - (PLAYER_WIDTH / 2) + (rawPlayerStart.xOffsetPx || 0); break;
            case 'right': playerStartX = newTile.x + newTile.width - PLAYER_WIDTH - (rawPlayerStart.xOffsetPx || 0); break;
          }
        }
      });
      
      if (levelPath === "/levels/level2.json") {
        const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
        if (p_ground_tile) {
            const p_ground_top_y = p_ground_tile.y;
            p3BasePosRef.current = { x: (currentCanvasWidth / 2) - (P3_SIZE_W / 2), y: p_ground_top_y - 300 };
            // console.log("[processRawLevelData] Level 2: p_ground_top_y:", p_ground_top_y, "p3BasePosRef.current:", p3BasePosRef.current);

            p3InterestPointsRef.current = [
              { x: 0, y: 0 }, { x: P3_DRIFT_RANGE, y: 0 }, { x: -P3_DRIFT_RANGE, y: 0 },
              { x: 0, y: P3_DRIFT_RANGE }, { x: 0, y: -P3_DRIFT_RANGE },
            ];
            p3CurrentTargetIndexRef.current = 0;
            p3MovementStateRef.current = null;

            const p3Tile: ProcessedTile = {
              id: 'p3',
              x: p3BasePosRef.current.x + p3InterestPointsRef.current[0].x,
              y: p3BasePosRef.current.y + p3InterestPointsRef.current[0].y,
              width: P3_SIZE_W, height: P3_SIZE_H, type: 1, color: 'hsl(var(--chart-3))',
              vx: 0, direction: 0, layer: 'background',
            };
            processedTiles.push(p3Tile);
            // console.log("[processRawLevelData] Level 2: Added p3Tile:", p3Tile);
        } else {
            console.warn("[processRawLevelData] Level 2: p_ground tile not found, cannot position p3.");
        }
      }

      const result: ProcessedLevelData = {
        playerStart: { xPx: playerStartX, yPx: playerStartY },
        tiles: processedTiles,
      };
      console.log(`[GameCanvas processRawLevelData] Successfully processed. Player:`, {x: result.playerStart.xPx, y: result.playerStart.yPx}, "Number of tiles:", result.tiles.length);
      return result;
    },
    [parseDimension, levelPath, PLAYER_WIDTH, PLAYER_HEIGHT, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE]
  );

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
        console.log(`[GameCanvas spawnNewCoinPair] Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
        if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
            console.warn("[GameCanvas spawnNewCoinPair] Pre-conditions not met. No coins spawned.");
            return [];
        }

        const newCoins: CoinState[] = [];
        const p_ground = currentProcessedLevel.tiles.find(t => t.id === 'p_ground');
        if (!p_ground) {
            console.warn("[GameCanvas spawnNewCoinPair] p_ground not found. Cannot determine coin spawn zone. No coins spawned.");
            return [];
        }
        const p_groundTopY = p_ground.y;

        let gamePlatforms = currentProcessedLevel.tiles.filter(t => t.type === 1 && t.id !== 'p_ground' && t.id !== 'house_roof_platform');
        if (levelPath === "/levels/level2.json") {
            gamePlatforms = gamePlatforms.filter(t => t.id !== 'p3'); // Exclude p3 from highest platform calculation for level 2
        } else if (levelPath === "/levels/level1.json") {
            // For level 1, ensure only 'floating_platform_left' and 'floating_platform_right' are considered
            gamePlatforms = currentProcessedLevel.tiles.filter(t => t.id === 'floating_platform_left' || t.id === 'floating_platform_right');
        }

        let actualHighestPlatformTopY = p_groundTopY;
        if (gamePlatforms.length > 0) {
            actualHighestPlatformTopY = Math.min(p_groundTopY, ...gamePlatforms.map(p => p.y));
        } else {
             // If no game platforms other than p_ground, use p_ground itself for top boundary calc
             actualHighestPlatformTopY = p_groundTopY;
        }


        const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
        const ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;

        if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
            console.warn(`[GameCanvas spawnNewCoinPair] Invalid spawn zone: Top edge (${ySpawnZoneTopCoinTopEdge.toFixed(2)}) is above or at bottom edge (${ySpawnZoneBottomCoinTopEdge.toFixed(2)}). No coins spawned.`);
            return [];
        }
        console.log(`[GameCanvas spawnNewCoinPair] Spawning coins. Zone Top: ${ySpawnZoneTopCoinTopEdge.toFixed(2)}, Zone Bottom: ${ySpawnZoneBottomCoinTopEdge.toFixed(2)}, Highest Platform Top: ${actualHighestPlatformTopY.toFixed(2)}`);
        
        for (let i = 0; i < 10; i++) { // Spawn 10 coins
            const isLeftHalf = i < 5;
            const xMin = isLeftHalf ? 0 : currentCanvasWidth / 2;
            const xMax = isLeftHalf ? currentCanvasWidth / 2 - COIN_SIZE : currentCanvasWidth - COIN_SIZE;
            
            const coinX = Math.random() * (xMax - xMin) + xMin;
            const coinY = Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge) + ySpawnZoneTopCoinTopEdge;

            newCoins.push({
                id: `coin-${Date.now()}-${i}`, x: coinX, y: coinY, width: COIN_SIZE, height: COIN_SIZE,
                isCollected: false, targetSpawnTime: Date.now() + i * COIN_SPAWN_STAGGER_DELAY,
                currentOpacity: 0, particles: [], isVisuallyPresent: true,
                rotationAngle: Math.random() * Math.PI * 2,
                rotationSpeed: Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN) + COIN_ROTATION_SPEED_MIN,
            });
        }
        console.log(`[GameCanvas spawnNewCoinPair] Created ${newCoins.length} coins. Coins:`, newCoins);
        return newCoins;
    },
    [levelPath, COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, MAX_JUMP_HEIGHT, COIN_SPAWN_TOP_MARGIN, COIN_SPAWN_STAGGER_DELAY, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]
  );

  const spawnSingleEnemy = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
      if (!currentProcessedLevel) return null;

      const p1_id_options = ['p1', 'floating_platform_left', 'floating_platform_1'];
      const p2_id_options = ['p2', 'floating_platform_right', 'floating_platform_2'];

      const p1 = currentProcessedLevel.tiles.find(t => p1_id_options.includes(t.id));
      const p2 = currentProcessedLevel.tiles.find(t => p2_id_options.includes(t.id));

      if (!p1 || !p2) {
        console.warn(`[GameCanvas spawnSingleEnemy] P1 or P2 not found for level ${levelPath}. Cannot spawn enemy.`);
        return null;
      }

      const enemyY = (p1.y + p1.height / 2 + p2.y + p2.height / 2) / 2 - ENEMY_RADIUS; // Center enemy vertically between P1 and P2 centers
      const newEnemy: EnemyState = {
        id: `enemy-${Date.now()}`, x: ENEMY_RADIUS * 2, y: enemyY, radius: ENEMY_RADIUS,
        width: ENEMY_RADIUS * 2, height: ENEMY_RADIUS * 2, // for collision
        vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR, direction: 1, color: ENEMY_COLOR,
      };
      console.log("[GameCanvas spawnSingleEnemy] Spawned new enemy:", newEnemy);
      return newEnemy;
    },
    [levelPath, ENEMY_RADIUS, PLATFORM_SPEED, ENEMY_SPEED_FACTOR, ENEMY_COLOR]
  );

  // Effect 1: Set isClient and load assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    setIsClient(true);

    const pImg = new Image(); pImg.src = `/assets/images/hero_jeans3.png`; pImg.setAttribute('data-ai-hint', 'character orange blue');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => { console.error("Failed to load player image."); setAssets(prev => ({ ...prev, playerImageLoaded: true })); };

    const tImg = new Image(); tImg.src = `/assets/images/platform_grass.png`; tImg.setAttribute('data-ai-hint', 'platform grass dirt');
    tImg.onload = () => setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true }));
    tImg.onerror = () => { console.error("Failed to load tile image."); setAssets(prev => ({ ...prev, tileImageLoaded: true })); };

    const cImg = new Image(); cImg.src = `/assets/images/thankscoin.png`; cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); };
    
    const stImg = new Image(); stImg.src = `/assets/images/stone1.jpg`; stImg.setAttribute('data-ai-hint', 'stone rock platform');
    stImg.onload = () => setAssets(prev => ({ ...prev, stoneImage: stImg, stoneImageLoaded: true }));
    stImg.onerror = () => { console.error("Failed to load stone image."); setAssets(prev => ({ ...prev, stoneImageLoaded: true })); };

    const tree1Img = new Image(); tree1Img.src = `/assets/images/tree1.png`; tree1Img.setAttribute('data-ai-hint', 'tree nature decor');
    tree1Img.onload = () => setAssets(prev => ({ ...prev, treeImage: tree1Img, treeImageLoaded: true }));
    tree1Img.onerror = () => { console.error("Failed to load tree1 image."); setAssets(prev => ({ ...prev, treeImageLoaded: true })); };
    
    const tree2Img = new Image(); tree2Img.src = `/assets/images/tree2.png`; tree2Img.setAttribute('data-ai-hint', 'tree nature decor');
    tree2Img.onload = () => setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true }));
    tree2Img.onerror = () => { console.error("Failed to load tree2 image."); setAssets(prev => ({ ...prev, tree2ImageLoaded: true })); };

    const flowerImg = new Image(); flowerImg.src = `/assets/images/flowers.png`; flowerImg.setAttribute('data-ai-hint', 'flowers plant decor');
    flowerImg.onload = () => setAssets(prev => ({ ...prev, flowerImage: flowerImg, flowerImageLoaded: true }));
    flowerImg.onerror = () => { console.error("Failed to load flower image."); setAssets(prev => ({ ...prev, flowerImageLoaded: true })); };

    const smallBushImg = new Image(); smallBushImg.src = `/assets/images/flowers.png`; smallBushImg.setAttribute('data-ai-hint', 'flowers small bush'); // Assuming small bushes also use flowers.png
    smallBushImg.onload = () => setAssets(prev => ({ ...prev, smallBushImage: smallBushImg, smallBushImageLoaded: true }));
    smallBushImg.onerror = () => { console.error("Failed to load smallBush image."); setAssets(prev => ({ ...prev, smallBushImageLoaded: true })); };

    const largeBushImg = new Image(); largeBushImg.src = `/assets/images/bush1.png`; largeBushImg.setAttribute('data-ai-hint', 'bush large decor');
    largeBushImg.onload = () => setAssets(prev => ({ ...prev, largeBushImage: largeBushImg, largeBushImageLoaded: true }));
    largeBushImg.onerror = () => { console.error("Failed to load largeBush image."); setAssets(prev => ({ ...prev, largeBushImageLoaded: true })); };
    
    const houseImg = new Image(); houseImg.src = `/assets/images/house1.png`; houseImg.setAttribute('data-ai-hint', 'house building structure');
    houseImg.onload = () => setAssets(prev => ({ ...prev, houseImage: houseImg, houseImageLoaded: true }));
    houseImg.onerror = () => { console.error("Failed to load house image."); setAssets(prev => ({ ...prev, houseImageLoaded: true })); };

  }, []); // isClient is managed by this effect itself, no need to depend on it here.

  // Effect 2: Apply canvasSize to canvas element attributes
  useEffect(() => {
    console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      console.log(`[GameCanvas Effect 2] Set canvas DOM size to W:${canvasRef.current.width} H:${canvasRef.current.height}`);
    }
  }, [canvasSize]);

  // Effect 3: Observe parent size and update canvasSize state
  const updateCanvasSizeState = useCallback((entries?: ResizeObserverEntry[]) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.parentElement) {
      const newWidth = canvas.parentElement.clientWidth;
      const newHeight = canvas.parentElement.clientHeight;
      console.log(`[GameCanvas Effect 3 updateCanvasSizeState] newWidth: ${newWidth}, newHeight: ${newHeight}`);

      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
          return { width: newWidth > 0 ? newWidth : 0, height: newHeight > 0 ? newHeight : 0 };
        }
        return currentSize;
      });
    }
  }, [setCanvasSize]);

  useEffect(() => {
    console.log(`[GameCanvas Effect 3] Running: Observe parent size`);
    const canvas = canvasRef.current;
    if (!isClient || !canvas || !canvas.parentElement) return;

    updateCanvasSizeState(); // Initial call

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateCanvasSizeState);
      resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', updateCanvasSizeState);
    }

    return () => {
      console.log("[GameCanvas Effect 3] Cleanup: Removing resize observer/listener.");
      if (resizeObserver && canvas.parentElement) {
        resizeObserver.unobserve(canvas.parentElement);
      } else {
        window.removeEventListener('resize', updateCanvasSizeState);
      }
    };
  }, [isClient, updateCanvasSizeState]);


  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      // if (isLoading) setIsLoading(false); // Avoid setting isLoading false prematurely
      return;
    }
    
    setRawLevelData(null); // Reset raw level data when levelPath changes
    if (!isLoading) setIsLoading(true); // Enter loading state for new level

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}. Setting rawLevelData to null.`);
          setRawLevelData(null); // Explicitly set to null on failure
          // setIsLoading(false); // Consider if game should proceed or show error
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
        // setIsLoading(false); // Consider error state
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData]); // isLoading removed as it's managed here


  // Effect 5: Process raw level data and initialize player
  useEffect(() => {
    const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded && assets.treeImageLoaded && assets.tree2ImageLoaded && assets.flowerImageLoaded && assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
        if (!isLoading && rawLevelData && (canvasSize.width === 0 || canvasSize.height === 0)) {
             // if rawLevelData is loaded but canvasSize is not yet, keep isLoading true
        } else if (!isLoading && (!rawLevelData || !allAssetsLoaded)) {
            // if critical data is missing and we are not loading, start loading
            setIsLoading(true);
        }
        // Clear processed level if critical data is missing
        if (processedLevelRef.current) {
          console.log("[GameCanvas Effect 5] Clearing processedLevel and playerInstanceRef due to missing critical data.");
          setProcessedLevel(null); 
          processedLevelRef.current = null;
          playerInstanceRef.current = null;
        }
        return;
    }
    
    console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    if (!isLoading) setIsLoading(true); // Ensure loading state during processing
    setActiveCoins([]); // Reset coins for new level
    setActiveEnemies([]); // Reset enemies for new level

    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);

    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
      const newPlayer: PlayerState = {
        x: newProcessedLevel.playerStart.xPx, y: newProcessedLevel.playerStart.yPx,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT, vx: 0, vy: 0, isOnGround: false,
        isMovingLeft: false, isMovingRight: false, color: PLAYER_COLOR,
        image: assets.playerImage, facingDirection: 'right',
      };
      playerInstanceRef.current = newPlayer;
      if (parentPlayerRef) parentPlayerRef.current = newPlayer;
      setProcessedLevel(newProcessedLevel);
      processedLevelRef.current = newProcessedLevel; // Update ref immediately
    } else {
      console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
      setProcessedLevel(null);
      processedLevelRef.current = null;
      // setIsLoading(false); // Should be handled by Effect 7
    }
  }, [
    isClient, rawLevelData, canvasSize, assets,
    processRawLevelData, setIsLoading, setProcessedLevel, setActiveCoins, setActiveEnemies,
    parentPlayerRef, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR, isLoading
  ]);


  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);

    if (!isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.");
      if (!isLoading && (canvasSize.width === 0 || canvasSize.height === 0 || !processedLevelRef.current)) {
         // If not loading but critical data is missing, re-enter loading state
         // This might happen if canvasSize becomes 0 after initial load
         // setIsLoading(true); 
      }
      return;
    }

    // This effect should primarily work when isLoading is true, to spawn initial entities.
    // If isLoading is false, it means entities should have been spawned or loading is complete.
    if (!isLoading) {
        console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).");
        return;
    }
    
    let coinsSpawnedOrAttempted = activeCoins.length > 0;
    if (!coinsSpawnedOrAttempted && processedLevelRef.current.tiles.length > 0) {
      console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
      const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
      console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
      setActiveCoins(newCoins);
      coinsSpawnedOrAttempted = true;
    } else if (processedLevelRef.current.tiles.length === 0) {
      // No tiles, so no coins needed (or possible to spawn based on platforms)
      console.log("[GameCanvas Effect 7] No tiles in processedLevel, considering coins 'attempted'.");
      coinsSpawnedOrAttempted = true; 
    }

    let enemiesSpawnedOrAttempted = activeEnemies.length > 0;
    // Only spawn enemies if not level 1 or level 2 (as per previous logic)
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
      if (!enemiesSpawnedOrAttempted && processedLevelRef.current.tiles.length > 0) {
        const newEnemy = spawnSingleEnemy(processedLevelRef.current, canvasSize.width);
        if (newEnemy) {
          setActiveEnemies([newEnemy]);
        }
        enemiesSpawnedOrAttempted = true;
      } else if (processedLevelRef.current.tiles.length === 0) {
         enemiesSpawnedOrAttempted = true;
      }
    } else {
      console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
      enemiesSpawnedOrAttempted = true; // Enemies not applicable for this level
    }
    
    // If all entities are attempted (or not needed), and we were loading, finish loading.
    if (coinsSpawnedOrAttempted && enemiesSpawnedOrAttempted) {
        console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    } else {
      console.log(`[GameCanvas Effect 7] Still waiting for entities. coinsSpawnedOrAttempted: ${coinsSpawnedOrAttempted}, enemiesSpawnedOrAttempted: ${enemiesSpawnedOrAttempted}`);
    }

  }, [
      isClient, isLoading, processedLevelRef.current, canvasSize, levelPath, // Using .current for processedLevel here
      // activeCoins.length, activeEnemies.length, // Removed to prevent re-triggering if isLoading is false
      spawnNewCoinPair, spawnSingleEnemy, setActiveCoins, setActiveEnemies, setIsLoading
  ]);


   // Effect 8: Respawn coins
   useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}, activeCoins length: ${activeCoins.length}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
      console.log("[GameCanvas Effect 8] All coins collected and particles gone, spawning new set.");
      const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
      setActiveCoins(newCoins);
    }
  }, [activeCoins, isClient, isLoading, canvasSize, spawnNewCoinPair, processedLevelRef, setActiveCoins]); // processedLevelRef used here

  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    // console.log("[gameLoop] CALLED"); 
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const player = playerInstanceRef.current;
    const currentLevelData = processedLevelRef.current; // Read from ref

    if (!ctx || !player || !currentLevelData || !canvas) {
      // console.warn("[gameLoop] Critical elements missing, skipping frame.");
      // requestAnimationFrame(gameLoop); // This is now handled by Effect 9
      return;
    }

    const loopStartTime = Date.now();
    let deltaTime = loopStartTime - lastFrameTime.current;
    const MAX_DELTA_TIME_MS = 100; 
    if (deltaTime > MAX_DELTA_TIME_MS) {
        // console.warn(`[gameLoop] DeltaTime capped from ${deltaTime} to ${MAX_DELTA_TIME_MS}`);
        deltaTime = MAX_DELTA_TIME_MS;
    }
    const deltaTimeFactor = Math.max(0.1, Math.min(2, deltaTime / (1000 / 60))); // Target 60 FPS

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentExecuteActionVal = executeActionRef.current;
    if (currentExecuteActionVal) {
      // console.log(`[gameLoop] Processing action: ${currentExecuteActionVal}, player.isOnGround: ${player.isOnGround}`);
      switch (currentExecuteActionVal) {
        case 'moveLeft': player.isMovingLeft = true; player.facingDirection = 'left'; break;
        case 'moveRight': player.isMovingRight = true; player.facingDirection = 'right'; break;
        case 'jump':
          if (player.isOnGround) {
            player.vy = JUMP_STRENGTH;
            player.isOnGround = false;
          }
          break;
        case 'stopMoveLeft': player.isMovingLeft = false; break;
        case 'stopMoveRight': player.isMovingRight = false; break;
      }
      resetExecuteAction(); // Call the prop function to reset in parent
      executeActionRef.current = null; // Reset the ref immediately
    }

    player.vx = 0;
    if (player.isMovingLeft) { player.vx = -PLAYER_SPEED; }
    if (player.isMovingRight) { player.vx = PLAYER_SPEED; }

    player.vy += GRAVITY * deltaTimeFactor;

    let proposedX = player.x + player.vx * deltaTimeFactor;
    let proposedY = player.y + player.vy * deltaTimeFactor;

    let platformInducedMoveX = 0;
    let onMovingPlatform = false;
    let activePlatformId: string | null = null;

    const updatedTiles = currentLevelData.tiles.map(tile => {
      if (tile.vx && tile.direction) {
        let newTileX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);
        let newDirection = tile.direction;
        
        // Define movement boundaries for specific tiles
        const tileSpecificMovementBounds = { left: 0, right: canvas.width }; // Default: canvas edges
        if (tile.id === 'boat1') {
            const waterPit = currentLevelData.tiles.find(t => t.id === 'water_pit');
            if (waterPit) {
                tileSpecificMovementBounds.left = waterPit.x;
                tileSpecificMovementBounds.right = waterPit.x + waterPit.width;
            }
        }
        
        if (newTileX + tile.width > tileSpecificMovementBounds.right) { newTileX = tileSpecificMovementBounds.right - tile.width; newDirection = -1; }
        else if (newTileX < tileSpecificMovementBounds.left) { newTileX = tileSpecificMovementBounds.left; newDirection = 1; }
        return { ...tile, x: newTileX, direction: newDirection };
      }
      return tile;
    });
    
    const p3Tile = updatedTiles.find(t => t.id === 'p3');
    let p3_delta_x = 0;
    let p3_delta_y = 0;

    if (p3Tile && p3BasePosRef.current && p3InterestPointsRef.current.length > 0) {
        if (!p3MovementStateRef.current) {
            const nextTargetIndex = (p3CurrentTargetIndexRef.current + 1 + Math.floor(Math.random() * (p3InterestPointsRef.current.length -1))) % p3InterestPointsRef.current.length;
            p3CurrentTargetIndexRef.current = (nextTargetIndex === p3CurrentTargetIndexRef.current && p3InterestPointsRef.current.length > 1) ? (nextTargetIndex + 1) % p3InterestPointsRef.current.length : nextTargetIndex;
            
            const targetOffset = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
            p3MovementStateRef.current = {
                startTime: loopStartTime, startX: p3Tile.x, startY: p3Tile.y,
                targetX: p3BasePosRef.current.x + targetOffset.x, targetY: p3BasePosRef.current.y + targetOffset.y,
            };
        }

        const state = p3MovementStateRef.current;
        const elapsedTime = loopStartTime - state.startTime;
        let t_p3_movement = Math.min(elapsedTime / P3_MOVEMENT_DURATION, 1); // Ensure t is between 0 and 1

        const newP3X = state.startX + (state.targetX - state.startX) * t_p3_movement;
        const newP3Y = state.startY + (state.targetY - state.startY) * t_p3_movement;
        
        p3_delta_x = newP3X - p3Tile.x;
        p3_delta_y = newP3Y - p3Tile.y;

        p3Tile.x = newP3X; p3Tile.y = newP3Y;
        if (t_p3_movement >= 1) p3MovementStateRef.current = null;
    }
    
    // Update the ref if tiles changed (e.g. moving platforms)
    if (processedLevelRef.current) processedLevelRef.current = { ...processedLevelRef.current, tiles: updatedTiles };


    player.isOnGround = false; activePlatformId = null; // Reset before checking vertical collisions
    updatedTiles.forEach(tile => {
      if (tile.type === 1 && checkCollision({ ...player, y: proposedY }, tile)) { // Check collision with proposed Y
        if (player.vy > 0) { // Moving down
          proposedY = tile.y - player.height; player.vy = 0; player.isOnGround = true; activePlatformId = tile.id;
          if (tile.vx && tile.direction) { platformInducedMoveX = tile.vx * tile.direction * deltaTimeFactor; onMovingPlatform = true; }
          if (tile.id === 'p3') { platformInducedMoveX = p3_delta_x; player.y += p3_delta_y; proposedY = player.y; onMovingPlatform = true; } // Apply P3's delta
        } else if (player.vy < 0) { // Moving up
          proposedY = tile.y + tile.height; player.vy = 0;
        }
      }
    });
    player.y = proposedY; // Set final Y after vertical collision checks

    // Horizontal movement with platform carry
    if (onMovingPlatform && activePlatformId !== 'p3') proposedX += platformInducedMoveX;
    else if (onMovingPlatform && activePlatformId === 'p3') proposedX += p3_delta_x; // Apply P3's X delta

    // Horizontal collision checks
    updatedTiles.forEach(tile => {
      if (tile.type === 1 && checkCollision({ ...player, x: proposedX }, tile)) { // Check collision with proposed X
        if (player.vx > 0) proposedX = tile.x - player.width; // Hit right side of tile
        else if (player.vx < 0) proposedX = tile.x + tile.width; // Hit left side of tile
        player.vx = 0; // Stop horizontal movement
      }
    });
    player.x = proposedX; // Set final X
    
    // Ground boundary check (e.g., p_ground or bottom of canvas)
    if (player.y + player.height > canvas.height) {
      player.y = canvas.height - player.height; player.vy = 0; player.isOnGround = true; activePlatformId = null;
      const groundPlatform = updatedTiles.find(t => t.id === 'p_ground');
      if (groundPlatform) activePlatformId = groundPlatform.id;
    }
    
    setActiveCoins(prevCoins => prevCoins.map(coin => {
        let newCoin = { ...coin };
        let particlesStillActive = false;

        if (newCoin.particles.length > 0) {
            newCoin.particles = newCoin.particles.map(p => {
                const newLife = p.life - deltaTime;
                if (newLife <= 0) return null;
                return { ...p, x: p.x + p.vx * deltaTimeFactor, y: p.y + p.vy * deltaTimeFactor,
                         vy: p.vy + (COIN_PARTICLE_GRAVITY_FACTOR * GRAVITY * deltaTimeFactor), // Apply gravity to particles
                         opacity: Math.max(0, (newLife / COIN_PARTICLE_LIFESPAN)), life: newLife };
            }).filter(p => p !== null) as Particle[];
            if (newCoin.particles.length > 0) particlesStillActive = true;
        }
        
        if (newCoin.isCollected) {
            // If collected and no active particles, mark as not visually present
            if (!particlesStillActive && newCoin.isVisuallyPresent) newCoin.isVisuallyPresent = false;
        } else {
            // Fade-in logic
            if (loopStartTime >= newCoin.targetSpawnTime && newCoin.currentOpacity < 1) {
                newCoin.currentOpacity = Math.min(newCoin.currentOpacity + deltaTime / COIN_FADE_IN_DURATION, 1);
            }
        }
        
        // Collision with player
        if (!newCoin.isCollected && newCoin.currentOpacity > 0.5 && checkCollision(player, newCoin)) {
            newCoin.isCollected = true; newCoin.currentOpacity = 0; // Make coin invisible immediately
            // Spawn particles
            for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * COIN_PARTICLE_SPEED_MULTIPLIER + 0.5;
                newCoin.particles.push({
                    x: newCoin.x + newCoin.width / 2, y: newCoin.y + newCoin.height / 2,
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    size: COIN_PARTICLE_SIZE, opacity: 1, life: COIN_PARTICLE_LIFESPAN,
                });
            }
        }
        // Rotation update
        newCoin.rotationAngle = (newCoin.rotationAngle + newCoin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2);
        return newCoin;
    }));

    setActiveEnemies(prevEnemies => prevEnemies.map(enemy => {
      let newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor);
      let newEnemyDirection = enemy.direction;

      // Enemy boundary check
      if (newEnemyX + enemy.width > canvas.width) { newEnemyX = canvas.width - enemy.width; newEnemyDirection = -1; }
      else if (newEnemyX < 0) { newEnemyX = 0; newEnemyDirection = 1; }
      const updatedEnemy = { ...enemy, x: newEnemyX, direction: newEnemyDirection };
      
      // Collision with player
      if (checkCollision(player, updatedEnemy)) {
        console.log("[GameLoop] Collision with enemy!");
        // toast({ title: "Ouch!", description: "Hit by an enemy!", variant: "destructive" });
        // Reset player position
        const ground = currentLevelData.tiles.find(t => t.id === 'p_ground');
        player.x = ground ? currentCanvasWidth / 2 - player.width / 2 : currentCanvasWidth / 2 - player.width / 2;
        player.y = ground ? ground.y - player.height : currentCanvasHeight - player.height - 50;
        player.vx = 0; player.vy = 0; player.isOnGround = true; activePlatformId = ground ? ground.id : null;
      }
      return updatedEnemy;
    }));

    // --- Rendering ---
    // Layer 1: Background tiles (decorations not in foreground)
    updatedTiles.forEach(tile => {
      if (tile.layer !== 'foreground') {
        if (tile.type === 1) { // Collidable platforms
          if (tile.id.startsWith('stone_') && assets.stoneImage?.complete) {
            ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);  
          } else if (assets.tileImage?.complete) {
            ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
          } else {
            ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
          }
        } else { // Decorative background elements
          if (tile.id === 'tree1' && assets.treeImage?.complete) ctx.drawImage(assets.treeImage, tile.x, tile.y, tile.width, tile.height);
          else if (tile.id === 'tree2' && assets.tree2Image?.complete) ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
          else if (tile.id === 'house1' && assets.houseImage?.complete) ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
          else if (tile.id !== 'water_area' && tile.id !== 'water_pit') { // Don't draw water areas here if they have special rendering
             ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
          }
        }
      }
    });

    // Render water separately to ensure it's under other elements but can be on top of deep background
    const waterTile = updatedTiles.find(t => t.id === 'water_area' || t.id === 'water_pit');
    if (waterTile) {
        ctx.fillStyle = waterTile.color;
        ctx.fillRect(waterTile.x, waterTile.y, waterTile.width, waterTile.height);
    }
    
    // Layer 2: Coins, Enemies
    if (activeCoins.length > 0) renderCoins(ctx, activeCoins, assets.coinImage);
    renderEnemies(ctx, activeEnemies); // Will do nothing if activeEnemies is empty

    // Layer 3: Player
    renderPlayer(ctx, player, assets.playerImage);

    // Layer 4: Foreground tiles (decorations)
    updatedTiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        if ((tile.id === "bush_left_1" || tile.id === "bush_right_1") && assets.smallBushImage?.complete) ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
        else if ((tile.id === "bush_left_2" || tile.id === "bush_right_2") && assets.largeBushImage?.complete) ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
        else if (tile.id === "bush1" && assets.flowerImage?.complete) ctx.drawImage(assets.flowerImage, tile.x, tile.y, tile.width, tile.height); // Assuming flowers.png is for bush1
        else {
            ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });

    lastFrameTime.current = loopStartTime;
    // requestAnimationFrame(gameLoop); // This is now handled by Effect 9
  }, [
    isClient, assets, resetExecuteAction, setActiveCoins, setActiveEnemies, // canvasSize removed
    levelPath, GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
    COIN_SIZE, COIN_FADE_IN_DURATION, COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SIZE, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR,
    ENEMY_COLOR, ENEMY_RADIUS, ENEMY_SPEED_FACTOR, PLATFORM_SPEED, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
    P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
    p3BasePosRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef, // These are refs, stable
    parentPlayerRef, 
    // Removed processRawLevelData, spawnNewCoinPair, spawnSingleEnemy - these are stable due to their own useCallback
  ]);

  // Effect 9: Game Loop Setup
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    let animationFrameId: number;
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;

    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start. isLoading: ${isLoading}, isClient: ${isClient}, canvasRef: ${!!canvasRef.current}, canvasSizeW: ${canvasSize.width}, canvasSizeH: ${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    }

    return () => {
      console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, canvasSize, processedLevelRef, gameLoop]); // gameLoop is memoized
  
  // Keyboard input handler
  useEffect(() => {
    if (!isClient) return; // Only run on client
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPlayerAction('moveLeft');
      if (e.key === 'ArrowRight') onPlayerAction('moveRight');
      if (e.key === 'ArrowUp' || e.key === ' ') onPlayerAction('jump');
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPlayerAction('stopMoveLeft');
      if (e.key === 'ArrowRight') onPlayerAction('stopMoveRight');
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onPlayerAction, isClient]); // isClient ensures this only runs when window is available
  
  console.log(`[GameCanvas] Before return. isClient: ${isClient}, isLoading: ${isLoading}`);
  
  // Always render the canvas, overlay the loading message if needed
  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full block" tabIndex={0} />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground">
          <p>Initializing Canvas...</p>
        </div>
      )}
    </div>
  );
}

