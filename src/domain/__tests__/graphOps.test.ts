import { describe, it, expect } from 'vitest'
import { EdgePredicate, createPersonEntity, createEdge, type GraphSchema } from '../graph'
import {
  resolveRelationship,
  shortestPersonPath,
  shortestBloodPath,
  buildRelationshipPath,
  computeGenerationTiers,
  brideGroomPartition,
  displayName,
  graphPeople,
} from '../graphOps'

function makePerson(id: string, firstName: string, sex = '', attrs: Record<string, unknown> = {}) {
  return createPersonEntity({
    id,
    label: firstName,
    attrs: { firstName, sex, lastName: '', nickname: '', email: '', dob: '', dod: '', branch: '', photo: '', birthPlace: '', currentResidence: '', privateNotes: '', links: [], ...attrs },
  })
}

function makeEdge(id: string, src: string, dst: string, predicate: EdgePredicate) {
  return createEdge({ id, src, dst, predicate })
}

function makeGraph(entities: ReturnType<typeof makePerson>[], edges: ReturnType<typeof makeEdge>[]): GraphSchema {
  return {
    version: '1',
    rootOwnerId: 'owner',
    entities,
    edges,
    metadata: {},
  }
}

// Family:
//   Thatha (M) -- Paatti (F)
//     |
//   Appa (M) -- Amma (F)
//     |
//   Me (M) -- Spouse (F)
//     |
//   Child (M)
//
//   Amma's brother: Mama (M)
//   Appa's sister: Athai (F)
//   Athai's husband: Athimber (M)

const thatha = makePerson('thatha', 'Thatha', 'male')
const paatti = makePerson('paatti', 'Paatti', 'female')
const appa = makePerson('appa', 'Appa', 'male')
const amma = makePerson('amma', 'Amma', 'female')
const me = makePerson('me', 'Me', 'male')
const spouse = makePerson('spouse', 'Spouse', 'female')
const child = makePerson('child', 'Child', 'male')
const mama = makePerson('mama', 'Mama', 'male')
const athai = makePerson('athai', 'Athai', 'female')
const athimber = makePerson('athimber', 'Athimber', 'male')

// Amma's parents (for maternal side)
const ammaThatha = makePerson('amma-thatha', 'AmmaThatha', 'male')
const ammaPaatti = makePerson('amma-paatti', 'AmmaPaatti', 'female')

const familyGraph = makeGraph(
  [thatha, paatti, appa, amma, me, spouse, child, mama, athai, athimber, ammaThatha, ammaPaatti],
  [
    // Thatha + Paatti are partners
    makeEdge('e1', 'thatha', 'paatti', EdgePredicate.PARTNER_OF),
    // Thatha & Paatti -> Appa
    makeEdge('e2', 'thatha', 'appa', EdgePredicate.PARENT_OF),
    makeEdge('e3', 'paatti', 'appa', EdgePredicate.PARENT_OF),
    // Thatha & Paatti -> Athai
    makeEdge('e4', 'thatha', 'athai', EdgePredicate.PARENT_OF),
    makeEdge('e5', 'paatti', 'athai', EdgePredicate.PARENT_OF),
    // Appa + Amma are partners
    makeEdge('e6', 'appa', 'amma', EdgePredicate.PARTNER_OF),
    // Appa & Amma -> Me
    makeEdge('e7', 'appa', 'me', EdgePredicate.PARENT_OF),
    makeEdge('e8', 'amma', 'me', EdgePredicate.PARENT_OF),
    // Me + Spouse are partners
    makeEdge('e9', 'me', 'spouse', EdgePredicate.PARTNER_OF),
    // Me & Spouse -> Child
    makeEdge('e10', 'me', 'child', EdgePredicate.PARENT_OF),
    makeEdge('e11', 'spouse', 'child', EdgePredicate.PARENT_OF),
    // AmmaThatha + AmmaPaatti -> Amma
    makeEdge('e12', 'amma-thatha', 'amma', EdgePredicate.PARENT_OF),
    makeEdge('e13', 'amma-paatti', 'amma', EdgePredicate.PARENT_OF),
    // AmmaThatha + AmmaPaatti -> Mama
    makeEdge('e14', 'amma-thatha', 'mama', EdgePredicate.PARENT_OF),
    makeEdge('e15', 'amma-paatti', 'mama', EdgePredicate.PARENT_OF),
    // AmmaThatha + AmmaPaatti partners
    makeEdge('e16', 'amma-thatha', 'amma-paatti', EdgePredicate.PARTNER_OF),
    // Athai + Athimber partners
    makeEdge('e17', 'athai', 'athimber', EdgePredicate.PARTNER_OF),
  ],
)

describe('resolveRelationship', () => {
  it('identifies same person', () => {
    const result = resolveRelationship(familyGraph, 'me', 'me')
    expect(result.key).toBe('same_person')
  })

  it('identifies partner/spouse', () => {
    const result = resolveRelationship(familyGraph, 'me', 'spouse')
    expect(result.key).toBe('husband')
  })

  it('identifies parent (father)', () => {
    const result = resolveRelationship(familyGraph, 'appa', 'me')
    expect(result.key).toBe('father')
  })

  it('identifies parent (mother)', () => {
    const result = resolveRelationship(familyGraph, 'amma', 'me')
    expect(result.key).toBe('mother')
  })

  it('identifies child (son)', () => {
    const result = resolveRelationship(familyGraph, 'me', 'appa')
    expect(result.key).toBe('son')
  })

  it('identifies grandparent', () => {
    const result = resolveRelationship(familyGraph, 'thatha', 'me')
    expect(result.key).toBe('grandfather')
  })

  it('identifies grandchild', () => {
    const result = resolveRelationship(familyGraph, 'me', 'thatha')
    expect(result.key).toBe('grandson')
  })

  it('identifies sibling', () => {
    const result = resolveRelationship(familyGraph, 'appa', 'athai')
    expect(result.key).toBe('brother')
  })

  it('identifies maternal uncle (mama)', () => {
    const result = resolveRelationship(familyGraph, 'mama', 'me')
    expect(result.key).toBe('maternal_uncle')
  })

  it('identifies paternal aunt (athai)', () => {
    const result = resolveRelationship(familyGraph, 'athai', 'me')
    expect(result.key).toBe('paternal_aunt')
  })

  it('identifies brother-in-law (partner\'s sibling)', () => {
    // Athai is Appa's sister, Athimber is Athai's partner
    // From Amma's perspective, Athimber is connected via Appa
    // But more directly: Me's spouse's brother would be brother-in-law
    // Let's test Athimber (Athai's husband) from Appa's perspective
    // Appa's sister's husband = brother-in-law
    const result = resolveRelationship(familyGraph, 'appa', 'athimber')
    expect(result.key).toBe('brother_in_law')
  })

  it('returns empty label for disconnected nodes', () => {
    const disconnected = makePerson('disconnected', 'Stranger', 'male')
    const graphWithDisconnected: GraphSchema = {
      ...familyGraph,
      entities: [...familyGraph.entities, disconnected],
    }
    const result = resolveRelationship(graphWithDisconnected, 'me', 'disconnected')
    expect(result.label).toBe('')
  })
})

describe('shortestPersonPath', () => {
  it('returns single-element path for same person', () => {
    expect(shortestPersonPath(familyGraph, 'me', 'me')).toEqual(['me'])
  })

  it('finds direct parent path', () => {
    const path = shortestPersonPath(familyGraph, 'me', 'appa')
    expect(path).toContain('me')
    expect(path).toContain('appa')
    expect(path.length).toBe(2)
  })

  it('finds multi-hop path through marriage', () => {
    const path = shortestPersonPath(familyGraph, 'me', 'athimber')
    expect(path.length).toBeGreaterThan(1)
    expect(path[0]).toBe('me')
    expect(path[path.length - 1]).toBe('athimber')
  })

  it('returns empty for disconnected nodes', () => {
    const disconnected = makePerson('disconnected', 'Stranger', 'male')
    const graphWithDisconnected: GraphSchema = {
      ...familyGraph,
      entities: [...familyGraph.entities, disconnected],
    }
    expect(shortestPersonPath(graphWithDisconnected, 'me', 'disconnected')).toEqual([])
  })
})

describe('shortestBloodPath', () => {
  it('finds blood path through parents', () => {
    const path = shortestBloodPath(familyGraph, 'me', 'mama')
    expect(path.length).toBeGreaterThan(0)
  })

  it('returns empty when no blood connection', () => {
    expect(shortestBloodPath(familyGraph, 'me', 'athimber')).toEqual([])
  })
})

describe('buildRelationshipPath', () => {
  it('returns empty for empty path', () => {
    expect(buildRelationshipPath(familyGraph, [])).toBe('')
  })

  it('builds a readable path for parent', () => {
    const path = shortestPersonPath(familyGraph, 'me', 'appa')
    const result = buildRelationshipPath(familyGraph, path)
    expect(result).toContain('You')
    expect(result).toContain('Appa')
  })

  it('builds a readable multi-hop path', () => {
    const path = shortestPersonPath(familyGraph, 'me', 'thatha')
    const result = buildRelationshipPath(familyGraph, path)
    expect(result).toContain('You')
    expect(result).toContain('→')
  })
})

describe('computeGenerationTiers', () => {
  it('assigns tier 0 to root person', () => {
    const tiers = computeGenerationTiers(familyGraph, 'me')
    expect(tiers.get('me')).toBe(0)
  })

  it('assigns negative tiers to parents', () => {
    const tiers = computeGenerationTiers(familyGraph, 'me')
    expect(tiers.get('appa')).toBe(-1)
    expect(tiers.get('amma')).toBe(-1)
  })

  it('assigns positive tiers to children', () => {
    const tiers = computeGenerationTiers(familyGraph, 'me')
    expect(tiers.get('child')).toBe(1)
  })

  it('assigns same tier to partners', () => {
    const tiers = computeGenerationTiers(familyGraph, 'me')
    expect(tiers.get('spouse')).toBe(0)
  })

  it('assigns -2 to grandparents', () => {
    const tiers = computeGenerationTiers(familyGraph, 'me')
    expect(tiers.get('thatha')).toBe(-2)
    expect(tiers.get('paatti')).toBe(-2)
  })
})

describe('brideGroomPartition', () => {
  it('partitions a simple two-family graph', () => {
    // Create a simple bride (from amma side) and groom (from appa side) scenario
    const result = brideGroomPartition(familyGraph, 'amma', 'appa')
    expect(result.bride.size + result.groom.size + result.shared.size).toBeGreaterThan(0)
  })

  it('handles same person as bride and groom', () => {
    const result = brideGroomPartition(familyGraph, 'me', 'me')
    expect(result.bride.size + result.groom.size + result.shared.size).toBeGreaterThan(0)
  })
})

describe('displayName', () => {
  it('prefers nickname', () => {
    expect(displayName({ nickname: 'Nick', firstName: 'First', label: 'Label' })).toBe('Nick')
  })

  it('falls back to firstName', () => {
    expect(displayName({ nickname: '', firstName: 'First', label: 'Label' })).toBe('First')
  })

  it('falls back to label', () => {
    expect(displayName({ nickname: '', firstName: '', label: 'Label' })).toBe('Label')
  })
})

describe('graphPeople', () => {
  it('returns only person entities', () => {
    const people = graphPeople(familyGraph)
    expect(people.length).toBe(familyGraph.entities.length)
    expect(people.every((p) => p.id)).toBe(true)
  })
})
