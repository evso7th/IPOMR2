import type { RawLevelData } from '@/types/game';

export async function loadLevel(levelPath: string): Promise<RawLevelData | null> {
  console.log(`[loadLevel] Attempting to fetch level from: ${levelPath}`);
  try {
    const response = await fetch(levelPath);
    if (!response.ok) {
      console.error(`[loadLevel] Failed to load level. Status: ${response.status}, StatusText: ${response.statusText}, Path: ${levelPath}`);
      return null;
    }
    // Make sure to parse as JSON
    const rawData: RawLevelData = await response.json();
    // console.log(`[loadLevel] Successfully loaded and parsed level from ${levelPath}:`, rawData);
    return rawData;
  } catch (error) {
    console.error(`[loadLevel] Error loading or parsing level from ${levelPath}:`, error);
    return null;
  }
}
