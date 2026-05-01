const ADJECTIVES = [
  'amber', 'bold', 'bright', 'calm', 'clever', 'cosmic', 'crisp', 'daring',
  'eager', 'electric', 'fierce', 'gentle', 'golden', 'graceful', 'grand',
  'humble', 'jolly', 'keen', 'lively', 'lucky', 'mighty', 'noble', 'plucky',
  'quiet', 'radiant', 'serene', 'shiny', 'sleek', 'snappy', 'stellar',
  'swift', 'teal', 'vivid', 'warm', 'wise', 'zesty', 'frosted', 'rustic',
  'velvet', 'silver', 'jade', 'onyx', 'azure', 'crimson', 'lunar', 'solar',
  'ancient', 'nimble', 'hollow', 'verdant',
]

const NOUNS = [
  'anchor', 'bear', 'bloom', 'bridge', 'cloud', 'comet', 'compass',
  'crystal', 'eagle', 'ember', 'falcon', 'flare', 'fox', 'garden',
  'glider', 'harbor', 'hawk', 'island', 'jewel', 'lantern', 'mountain',
  'panda', 'peak', 'river', 'spark', 'star', 'stone', 'tiger',
  'trail', 'tree', 'wave', 'wolf', 'torch', 'prism', 'current',
  'ridge', 'canopy', 'echo', 'tide', 'dune', 'glade', 'vault',
  'pylon', 'lens', 'basin', 'crest', 'grove', 'reef', 'spire',
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

export function generateName(seed: string): string {
  const hash = hashString(seed)
  const adj = ADJECTIVES[hash % ADJECTIVES.length]
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length]
  return `${adj} ${noun}`
}
