import type { RawLevelData } from '@/types/game';

export async function loadLevel(levelPath: string): Promise<RawLevelData | null> {
  console.log(`[loadLevel] Attempting to fetch level from: ${levelPath}`);
  try {
    const response = await fetch(levelPath);
    if (!response.ok) {
      console.error(`[loadLevel] Failed to load level. Status: ${response.status}, StatusText: ${response.statusText || 'N/A'}, Path: ${levelPath}. Please check if the file exists in the 'public' directory and if the development server is running correctly and can serve static files.`);
      return null;
    }
    const rawData: RawLevelData = await response.json();
    return rawData;
  } catch (error) {
    console.error(`[loadLevel] Error loading or parsing level from ${levelPath}:`, error);
    return null;
  }
}
