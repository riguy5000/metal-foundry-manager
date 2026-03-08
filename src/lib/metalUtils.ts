/**
 * Utility functions for metal type display logic
 */

export function getMetalCardClass(colorGroup: string, metalFamily: string): string {
  const color = colorGroup?.toLowerCase() ?? '';
  const family = metalFamily?.toLowerCase() ?? '';
  
  if (family === 'platinum') return 'metal-card-platinum';
  if (family === 'palladium') return 'metal-card-palladium';
  if (family === 'silver') return 'metal-card-silver';
  if (color === 'red') return 'metal-card-red';
  if (color === 'rose') return 'metal-card-rose';
  if (color === 'white') return 'metal-card-white';
  return 'metal-card-yellow';
}

export function getMetalDotClass(colorGroup: string, metalFamily: string): string {
  const color = colorGroup?.toLowerCase() ?? '';
  const family = metalFamily?.toLowerCase() ?? '';
  
  if (family === 'platinum') return 'metal-dot-platinum';
  if (family === 'palladium') return 'metal-dot-palladium';
  if (family === 'silver') return 'metal-dot-silver';
  if (color === 'red') return 'metal-dot-red';
  if (color === 'rose') return 'metal-dot-rose';
  if (color === 'white') return 'metal-dot-white';
  return 'metal-dot-yellow';
}

export function getMetalEmoji(colorGroup: string, metalFamily: string): string {
  const color = colorGroup?.toLowerCase() ?? '';
  const family = metalFamily?.toLowerCase() ?? '';
  
  if (family === 'platinum') return '💎';
  if (family === 'palladium') return '🔘';
  if (family === 'silver') return '🥈';
  if (color === 'red') return '🥇';
  if (color === 'rose') return '🥇';
  if (color === 'white') return '🥇';
  return '🥇';
}

export function getMetalAccentColor(colorGroup: string, metalFamily: string): string {
  const color = colorGroup?.toLowerCase() ?? '';
  const family = metalFamily?.toLowerCase() ?? '';
  
  if (family === 'platinum') return 'text-metal-platinum';
  if (family === 'palladium') return 'text-metal-palladium';
  if (family === 'silver') return 'text-metal-silver';
  if (color === 'red') return 'text-metal-red';
  if (color === 'rose') return 'text-metal-rose';
  if (color === 'white') return 'text-metal-white';
  return 'text-metal-yellow';
}

/** Generate a flask code: CST-YYYYMMDD-XXXX */
export function generateFlaskCode(sequence: number = 1): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  // Random 4 char alphanumeric suffix for uniqueness
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `CST-${yyyy}${mm}${dd}-${suffix}`;
}

/** Group metals by family for hierarchical selection */
export function groupMetalsByFamily(metals: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const m of metals) {
    const family = m.metal_family || 'Other';
    if (!groups[family]) groups[family] = [];
    groups[family].push(m);
  }
  return groups;
}
