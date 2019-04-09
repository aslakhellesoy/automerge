import * as assert from 'assert'
import { Frontend } from 'automerge'
import * as Backend from 'backend'
import { STATE } from 'frontend/constants'
import uuid from 'uuid'

import * as TestType from './types'

const ROOT_ID = '00000000-0000-0000-0000-000000000000'
const UUID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/

describe('Automerge.Frontend', () => {
  it('should be an empty object by default', () => {
    const doc = Frontend.init()
    assert.deepEqual(doc, {})
    assert.strictEqual(UUID_PATTERN.test(Frontend.getActorId(doc).toString()), true)
  })

  it('should allow actorId assignment to be deferred', () => {
    let doc0 = Frontend.init<TestType.Foo>({ deferActorId: true })
    assert.strictEqual(Frontend.getActorId(doc0), undefined)
    assert.throws(() => {
      Frontend.change(doc0, doc => (doc.foo = 'bar'))
    }, /Actor ID must be initialized with setActorId/)
    const doc1 = Frontend.setActorId(doc0, uuid())
    const [doc2, req] = Frontend.change(doc1, doc => (doc.foo = 'bar'))
    assert.deepEqual(doc2, { foo: 'bar' })
  })

  describe('performing changes', () => {
    it('should return the unmodified document if nothing changed', () => {
      const doc0 = Frontend.init<TestType.Foo>()
      const [doc1] = Frontend.change(doc0, () => {})
      assert.strictEqual(doc1, doc0)
    })

    it('should set root object properties', () => {
      const actor = uuid()
      let [doc, req] = Frontend.change(Frontend.init<TestType.BirdBox>(actor), doc => (doc.bird = 'magpie'))
      const change: Change = {
        requestType: 'change',
        actor,
        seq: 1,
        deps: {},
        ops: [{ obj: ROOT_ID, action: 'set', key: 'bird', value: 'magpie' }],
      }
      assert.deepEqual(doc, { bird: 'magpie' })
      assert.deepEqual(req, change)
    })

    it('should create nested maps', () => {
      const [doc, req] = Frontend.change(Frontend.init<TestType.AnimalMap>(), doc => (doc.birds = { wrens: 3 }))
      const birds = Frontend.getObjectId(doc.birds)
      const actor = Frontend.getActorId(doc)
      const change: Change = {
        requestType: 'change',
        actor,
        seq: 1,
        deps: {},
        ops: [
          { obj: birds, action: 'makeMap' },
          { obj: birds, action: 'set', key: 'wrens', value: 3 },
          { obj: ROOT_ID, action: 'link', key: 'birds', value: birds },
        ],
      }
      assert.deepEqual(doc, { birds: { wrens: 3 } })
      assert.deepEqual(req, change)
    })

    it('should apply updates inside nested maps', () => {
      const [doc1, req1] = Frontend.change(Frontend.init<TestType.AnimalMap>(), doc => (doc.birds = { wrens: 3 }))
      const [doc2, req2] = Frontend.change(doc1, doc => (doc.birds.sparrows = 15))
      const birds = Frontend.getObjectId(doc2.birds)
      const actor = Frontend.getActorId(doc1)
      const change: Change = {
        requestType: 'change',
        actor,
        seq: 2,
        deps: {},
        ops: [{ obj: birds, action: 'set', key: 'sparrows', value: 15 }],
      }
      assert.deepEqual(doc1, { birds: { wrens: 3 } })
      assert.deepEqual(doc2, { birds: { wrens: 3, sparrows: 15 } })
      assert.deepEqual(req2, change)
    })

    it('should delete keys in maps', () => {
      const actor = uuid()
      const [doc1, req1] = Frontend.change(Frontend.init<TestType.CountMap>(actor), doc => {
        doc.magpies = 2
        doc.sparrows = 15
      })
      const [doc2, req2] = Frontend.change(doc1, doc => delete doc['magpies'])
      const change: Change = {
        requestType: 'change',
        actor,
        seq: 2,
        deps: {},
        ops: [{ obj: ROOT_ID, action: 'del', key: 'magpies' }],
      }

      const expected1: TestType.CountMap = { magpies: 2, sparrows: 15 }
      const expected2: TestType.CountMap = { sparrows: 15 }
      assert.deepEqual(doc1, expected1)
      assert.deepEqual(doc2, expected2)
      assert.deepEqual(req2, change)
    })

    it('should create lists', () => {
      const [doc, req] = Frontend.change(Frontend.init<TestType.BirdList>(), doc => (doc.birds = ['chaffinch']))
      const birds = Frontend.getObjectId(doc.birds)
      const actor = Frontend.getActorId(doc)
      const change: Change = {
        requestType: 'change',
        actor,
        seq: 1,
        deps: {},
        ops: [
          { obj: birds, action: 'makeList' },
          { obj: birds, action: 'ins', key: '_head', elem: 1 },
          { obj: birds, action: 'set', key: `${actor}:1`, value: 'chaffinch' },
          { obj: ROOT_ID, action: 'link', key: 'birds', value: birds },
        ],
      }
      const expected: TestType.BirdList = { birds: ['chaffinch'] }
      assert.deepEqual(doc, expected)
      assert.deepEqual(req, change)
    })

    it('should apply updates inside lists', () => {
      const [doc1, req1] = Frontend.change(Frontend.init<TestType.BirdList>(), doc => (doc.birds = ['chaffinch']))
      const [doc2, req2] = Frontend.change(doc1, doc => (doc.birds[0] = 'greenfinch'))
      const birds = Frontend.getObjectId(doc2.birds)
      const actor = Frontend.getActorId(doc2)
      const change: Change = {
        requestType: 'change',
        actor,
        seq: 2,
        deps: {},
        ops: [{ obj: birds, action: 'set', key: `${actor}:1`, value: 'greenfinch' }],
      }
      const expected1: TestType.BirdList = { birds: ['chaffinch'] }
      const expected2: TestType.BirdList = { birds: ['greenfinch'] }
      assert.deepEqual(doc1, expected1)
      assert.deepEqual(doc2, expected2)
      assert.deepEqual(req2, change)
    })

    it('should delete list elements', () => {
      const [doc1, req1] = Frontend.change(
        Frontend.init<TestType.BirdList>(),
        doc => (doc.birds = ['chaffinch', 'goldfinch'])
      )
      const [doc2, req2] = Frontend.change(doc1, doc => doc.birds.deleteAt(0))
      const birds = Frontend.getObjectId(doc2.birds)
      const actor = Frontend.getActorId(doc2)
      const change: Change = {
        requestType: 'change',
        actor,
        seq: 2,
        deps: {},
        ops: [{ obj: birds, action: 'del', key: `${actor}:1` }],
      }
      const expected1: TestType.BirdList = { birds: ['chaffinch', 'goldfinch'] }
      const expected2: TestType.BirdList = { birds: ['goldfinch'] }
      assert.deepEqual(doc1, expected1)
      assert.deepEqual(doc2, expected2)
      assert.deepEqual(req2, change)
    })

    it('should store Date objects as timestamps', () => {
      const now = new Date()
      const [doc, req] = Frontend.change(Frontend.init<TestType.DateBox>(), doc => (doc.now = now))
      const actor = Frontend.getActorId(doc)
      const change = {
        requestType: 'change',
        actor,
        seq: 1,
        deps: {},
        ops: [{ obj: ROOT_ID, action: 'set', key: 'now', value: now.getTime(), datatype: 'timestamp' }],
      }
      assert.strictEqual(doc.now instanceof Date, true)
      assert.strictEqual(doc.now.getTime(), now.getTime())
      assert.deepEqual(req, change)
    })
  })

  describe('counters', () => {
    it('should handle counters inside maps', () => {
      const [doc1, req1] = Frontend.change(Frontend.init<TestType.CounterMap>(), doc => {
        doc.wrens = new Frontend.Counter()
        assert.strictEqual(doc.wrens.value, 0)
      })
      const [doc2, req2] = Frontend.change(doc1, doc => {
        doc.wrens.increment()
        assert.strictEqual(doc.wrens.value, 1)
      })
      const actor = Frontend.getActorId(doc2)
      const expected1: TestType.CounterMap = { wrens: new Frontend.Counter(0) }
      const expected2: TestType.CounterMap = { wrens: new Frontend.Counter(1) }
      assert.deepEqual(doc1, expected1)
      assert.deepEqual(doc2, expected2)
      const expectedChange1: Change = {
        requestType: 'change',
        actor,
        seq: 1,
        deps: {},
        ops: [{ obj: ROOT_ID, action: 'set', key: 'wrens', value: 0, datatype: 'counter' }],
      }
      const expectedChange2: Change = {
        requestType: 'change',
        actor,
        seq: 2,
        deps: {},
        ops: [{ obj: ROOT_ID, action: 'inc', key: 'wrens', value: 1 }],
      }
      assert.deepEqual(req1, expectedChange1)
      assert.deepEqual(req2, expectedChange2)
    })

    it('should handle counters inside lists', () => {
      const [doc1, req1] = Frontend.change(Frontend.init(), doc => {
        doc.counts = [new Frontend.Counter(1)]
        assert.strictEqual(doc.counts[0].value, 1)
      })
      const [doc2, req2] = Frontend.change(doc1, doc => {
        doc.counts[0].increment(2)
        assert.strictEqual(doc.counts[0].value, 3)
      })
      const counts = Frontend.getObjectId(doc2.counts),
        actor = Frontend.getActorId(doc2)
      const expected1 = { counts: [new Frontend.Counter(1)] }
      assert.deepEqual(doc1, expected1)
      const expected2 = { counts: [new Frontend.Counter(3)] }
      assert.deepEqual(doc2, expected2)
      const expectedChange1: Change = {
        requestType: 'change',
        actor,
        seq: 1,
        deps: {},
        ops: [
          { obj: counts, action: 'makeList' },
          { obj: counts, action: 'ins', key: '_head', elem: 1 },
          { obj: counts, action: 'set', key: `${actor}:1`, value: 1, datatype: 'counter' },
          { obj: ROOT_ID, action: 'link', key: 'counts', value: counts },
        ],
      }
      const expectedChange2: Change = {
        requestType: 'change',
        actor,
        seq: 2,
        deps: {},
        ops: [{ obj: counts, action: 'inc', key: `${actor}:1`, value: 2 }],
      }
      assert.deepEqual(req1, expectedChange1)
      assert.deepEqual(req2, expectedChange2)
    })

    it('should coalesce assignments and increments', () => {
      const [doc1, req1] = Frontend.change(Frontend.init<TestType.BirdCounterMap>(), doc => (doc.birds = {}))
      const [doc2, req2] = Frontend.change(doc1, doc => {
        doc.birds.wrens = new Frontend.Counter(1)
        doc.birds.wrens.increment(2)
      })
      const birds = Frontend.getObjectId(doc2.birds),
        actor = Frontend.getActorId(doc2)
      const expected1: TestType.BirdCounterMap = { birds: {} }
      const expected2: TestType.BirdCounterMap = { birds: { wrens: new Frontend.Counter(3) } }
      assert.deepEqual(doc1, expected1)
      assert.deepEqual(doc2, expected2)
      const expectedChange: Change = {
        requestType: 'change',
        actor,
        seq: 2,
        deps: {},
        ops: [{ obj: birds, action: 'set', key: 'wrens', value: 3 }],
      }
      assert.deepEqual(req2, expectedChange)
    })

    it('should coalesce multiple increments', () => {
      const [doc1, req1] = Frontend.change(
        Frontend.init<TestType.BirdCounterMap>(),
        doc => (doc.birds = { wrens: new Frontend.Counter() })
      )
      const [doc2, req2] = Frontend.change(doc1, doc => {
        doc.birds.wrens.increment(2)
        doc.birds.wrens.decrement()
        doc.birds.wrens.increment(3)
      })
      const birds = Frontend.getObjectId(doc2.birds),
        actor = Frontend.getActorId(doc2)
      const expected1: TestType.BirdCounterMap = { birds: { wrens: new Frontend.Counter(0) } }
      const expected2: TestType.BirdCounterMap = { birds: { wrens: new Frontend.Counter(4) } }
      assert.deepEqual(doc1, expected1)
      assert.deepEqual(doc2, expected2)
      const expectedChange: Change = {
        requestType: 'change',
        actor,
        seq: 2,
        deps: {},
        ops: [{ obj: birds, action: 'inc', key: 'wrens', value: 4 }],
      }
      assert.deepEqual(req2, expectedChange)
    })

    it('should refuse to overwrite a property with a counter value', () => {
      interface CounterTest {
        counter: Frontend.Counter
        list: Frontend.Counter[]
      }
      const [doc1, req1] = Frontend.change(Frontend.init<CounterTest>(), doc => {
        doc.counter = new Frontend.Counter()
        doc.list = [new Frontend.Counter()]
      })
      assert.throws(
        () => Frontend.change(doc1, doc => ((doc.counter as unknown) as number)++),
        /Cannot overwrite a Counter object/
      )
      assert.throws(
        () => Frontend.change(doc1, doc => (((doc.list[0] as unknown) as number) = 3)),
        /Cannot overwrite a Counter object/
      )
    })

    it('should make counter objects behave like primitive numbers', () => {
      const [doc1, req1] = Frontend.change(
        Frontend.init<TestType.CounterMap>(),
        doc => (doc.birds = new Frontend.Counter(3))
      )
      assert.equal(doc1.birds, 3) // they are equal according to ==, but not strictEqual according to ===
      assert.notStrictEqual(doc1.birds, 3)

      // We have to explicitly cast these as number to keep TypeScript happy,
      // because it doesn't know about the `.valueOf()` trick.
      // https://github.com/Microsoft/TypeScript/issues/2361
      assert.strictEqual(((doc1.birds as unknown) as number) < 4, true)
      assert.strictEqual(((doc1.birds as unknown) as number) >= 0, true)
      assert.strictEqual(((doc1.birds as unknown) as number) <= 2, false)
      assert.strictEqual(((doc1.birds as unknown) as number) + 10, 13)

      assert.strictEqual(`I saw ${doc1.birds} birds`, 'I saw 3 birds')
      assert.strictEqual(['I saw', doc1.birds, 'birds'].join(' '), 'I saw 3 birds')
    })
  })

  describe('backend concurrency', () => {
    function getRequests(doc: any): Change[] {
      return doc[STATE].requests.map((req: Change) => {
        req = Object.assign({}, req)
        delete req['before']
        delete req['diffs']
        return req
      })
    }

    it('should use dependencies and sequence number from the backend', () => {
      const local = uuid()
      const remote1 = uuid()
      const remote2 = uuid()
      const patch1: Patch = {
        clock: { [local]: 4, [remote1]: 11, [remote2]: 41 },
        deps: { [local]: 4, [remote2]: 41 },
        diffs: [{ action: 'set', obj: ROOT_ID, type: 'map', key: 'blackbirds', value: 24 }],
      }
      let doc1 = Frontend.applyPatch<TestType.CountMap>(Frontend.init(local), patch1)
      let [doc2, req] = Frontend.change<TestType.CountMap>(doc1, doc => (doc.partridges = 1))
      const expected: Change[] = [
        {
          requestType: 'change',
          actor: local,
          seq: 5,
          deps: { [remote2]: 41 },
          ops: [{ obj: ROOT_ID, action: 'set', key: 'partridges', value: 1 }],
        },
      ]
      assert.deepEqual(getRequests(doc2), expected)
    })

    it('should remove pending requests once handled', () => {
      const actor = uuid()
      let [doc1, change1] = Frontend.change<TestType.CountMap>(Frontend.init(actor), doc => (doc.blackbirds = 24))
      let [doc2, change2] = Frontend.change<TestType.CountMap>(doc1, doc => (doc.partridges = 1))
      assert.deepEqual(getRequests(doc2), [
        {
          requestType: 'change',
          actor,
          seq: 1,
          deps: {},
          ops: [{ obj: ROOT_ID, action: 'set', key: 'blackbirds', value: 24 }],
        },
        {
          requestType: 'change',
          actor,
          seq: 2,
          deps: {},
          ops: [{ obj: ROOT_ID, action: 'set', key: 'partridges', value: 1 }],
        },
      ])
      const diffs1: Diff[] = [
        {
          obj: ROOT_ID,
          type: 'map',
          action: 'set',
          key: 'blackbirds',
          value: 24,
        },
      ]
      doc2 = Frontend.applyPatch(doc2, { actor, seq: 1, diffs: diffs1 })
      assert.deepEqual(doc2, { blackbirds: 24, partridges: 1 })
      assert.deepEqual(getRequests(doc2), [
        {
          requestType: 'change',
          actor,
          seq: 2,
          deps: {},
          ops: [{ obj: ROOT_ID, action: 'set', key: 'partridges', value: 1 }],
        },
      ])
      const diffs2: Diff[] = [
        {
          obj: ROOT_ID,
          type: 'map',
          action: 'set',
          key: 'partridges',
          value: 1,
        },
      ]
      doc2 = Frontend.applyPatch(doc2, { actor, seq: 2, diffs: diffs2 })
      const expected: TestType.CountMap = { blackbirds: 24, partridges: 1 }
      assert.deepEqual(doc2, expected)
      assert.deepEqual(getRequests(doc2), [])
    })

    it('should leave the request queue unchanged on remote patches', () => {
      const actor = uuid()
      const other = uuid()
      let [doc, req] = Frontend.change<TestType.CountMap>(Frontend.init(actor), doc => (doc.blackbirds = 24))
      const expectedChanges1 = [
        {
          requestType: 'change',
          actor,
          seq: 1,
          deps: {},
          ops: [{ obj: ROOT_ID, action: 'set', key: 'blackbirds', value: 24 }],
        },
      ]
      assert.deepEqual(getRequests(doc), expectedChanges1)
      const diffs1: Diff[] = [{ obj: ROOT_ID, type: 'map', action: 'set', key: 'pheasants', value: 2 }]
      doc = Frontend.applyPatch(doc, { actor: other, seq: 1, diffs: diffs1 })
      assert.deepEqual(doc, { blackbirds: 24, pheasants: 2 })
      const expectedChanges2: Change[] = [
        {
          requestType: 'change',
          actor,
          seq: 1,
          deps: {},
          ops: [{ obj: ROOT_ID, action: 'set', key: 'blackbirds', value: 24 }],
        },
      ]
      assert.deepEqual(getRequests(doc), expectedChanges2)
      const diffs2: Diff[] = [{ obj: ROOT_ID, type: 'map', action: 'set', key: 'blackbirds', value: 24 }]
      doc = Frontend.applyPatch(doc, { actor, seq: 1, diffs: diffs2 })
      assert.deepEqual(doc, { blackbirds: 24, pheasants: 2 })
      assert.deepEqual(getRequests(doc), [])
    })

    it('should not allow request patches to be applied out of order', () => {
      const [doc1, req1] = Frontend.change<TestType.CountMap>(Frontend.init(), doc => (doc.blackbirds = 24))
      const [doc2, req2] = Frontend.change<TestType.CountMap>(doc1, doc => (doc.partridges = 1))
      const actor = Frontend.getActorId(doc2)
      const diffs: Diff[] = [{ obj: ROOT_ID, type: 'map', action: 'set', key: 'partridges', value: 1 }]
      assert.throws(() => {
        Frontend.applyPatch(doc2, { actor, seq: 2, diffs })
      }, /Mismatched sequence number/)
    })

    it('should transform concurrent insertions', () => {
      let [doc1] = Frontend.change(Frontend.init<TestType.BirdList>(), doc => (doc.birds = ['goldfinch']))
      const birds = Frontend.getObjectId(doc1.birds)
      const actor = Frontend.getActorId(doc1)
      const diffs1: Diff[] = [
        { obj: birds, type: 'list', action: 'create' },
        { obj: birds, type: 'list', action: 'insert', index: 0, value: 'goldfinch', elemId: `${actor}:1` },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'birds', value: birds, link: true },
      ]
      doc1 = Frontend.applyPatch(doc1, { actor, seq: 1, diffs: diffs1 })
      assert.deepEqual(doc1, { birds: ['goldfinch'] } as TestType.BirdList)
      assert.deepEqual(getRequests(doc1), [])

      const [doc2, req2] = Frontend.change(doc1, doc => {
        doc.birds.insertAt(0, 'chaffinch')
        doc.birds.insertAt(2, 'greenfinch')
      })
      assert.deepEqual(doc2, { birds: ['chaffinch', 'goldfinch', 'greenfinch'] } as TestType.BirdList)

      const diffs3: Diff[] = [
        { obj: birds, type: 'list', action: 'insert', index: 1, value: 'bullfinch', elemId: `${uuid()}:2` },
      ]
      const doc3 = Frontend.applyPatch(doc2, { actor: uuid(), seq: 1, diffs: diffs3 })
      // TODO this is not correct: order of 'bullfinch' and 'greenfinch' should depend on their elemIds
      assert.deepEqual(doc3, { birds: ['chaffinch', 'goldfinch', 'bullfinch', 'greenfinch'] } as TestType.BirdList)
      const diffs4: Diff[] = [
        { obj: birds, type: 'list', action: 'insert', index: 0, value: 'chaffinch', elemId: `${actor}:2` },
        { obj: birds, type: 'list', action: 'insert', index: 2, value: 'greenfinch', elemId: `${actor}:3` },
      ]
      const doc4 = Frontend.applyPatch(doc3, { actor, seq: 2, diffs: diffs4 })
      assert.deepEqual(doc4, { birds: ['chaffinch', 'goldfinch', 'greenfinch', 'bullfinch'] } as TestType.BirdList)
      assert.deepEqual(getRequests(doc4), [])
    })

    it('should allow interleaving of patches and changes', () => {
      const actor = uuid()
      const [doc1, req1] = Frontend.change<TestType.NumberBox>(Frontend.init(actor), doc => (doc.number = 1))
      const [doc2, req2] = Frontend.change<TestType.NumberBox>(doc1, doc => (doc.number = 2))
      assert.deepEqual(req1, {
        requestType: 'change',
        actor,
        seq: 1,
        deps: {},
        ops: [{ obj: ROOT_ID, action: 'set', key: 'number', value: 1 }],
      } as Change)
      assert.deepEqual(req2, {
        requestType: 'change',
        actor,
        seq: 2,
        deps: {},
        ops: [{ obj: ROOT_ID, action: 'set', key: 'number', value: 2 }],
      } as Change)
      const state0 = Backend.init<TestType.NumberBox>()
      const [state1, patch1] = Backend.applyLocalChange(state0, req1)
      const doc2a = Frontend.applyPatch(doc2, patch1)
      const [doc3, req3] = Frontend.change(doc2a, doc => (doc.number = 3))
      assert.deepEqual(req3, {
        requestType: 'change',
        actor,
        seq: 3,
        deps: {},
        ops: [{ obj: ROOT_ID, action: 'set', key: 'number', value: 3 }],
      } as Change)
    })
  })

  describe('applying patches', () => {
    it('should set root object properties', () => {
      const diffs: Diff[] = [{ obj: ROOT_ID, type: 'map', action: 'set', key: 'bird', value: 'magpie' }]
      const doc = Frontend.applyPatch(Frontend.init<TestType.BirdBox>(), { diffs })
      assert.deepEqual(doc, { bird: 'magpie' } as TestType.BirdBox)
    })

    it('should reveal conflicts on root object properties', () => {
      const actor = uuid()
      const diffs: Diff[] = [
        {
          obj: ROOT_ID,
          type: 'map',
          action: 'set',
          key: 'bird',
          value: 'wagtail',
          conflicts: [{ actor, value: 'robin' }],
        },
      ]
      const doc: TestType.BirdBox = Frontend.applyPatch(Frontend.init<TestType.BirdBox>(), { diffs })
      assert.deepEqual(doc, { bird: 'wagtail' } as TestType.BirdBox)
      assert.deepEqual(Frontend.getConflicts(doc, 'bird'), { [actor]: 'robin' })
    })

    it('should create nested maps', () => {
      const birds = uuid()
      const diffs: Diff[] = [
        { obj: birds, type: 'map', action: 'create' },
        { obj: birds, type: 'map', action: 'set', key: 'wrens', value: 3 },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'birds', value: birds, link: true },
      ]
      const doc = Frontend.applyPatch(Frontend.init<TestType.AnimalMap>(), { diffs })
      assert.deepEqual(doc, { birds: { wrens: 3 } } as TestType.AnimalMap)
    })

    it('should apply updates inside nested maps', () => {
      const birds = uuid()
      const diffs1: Diff[] = [
        { obj: birds, type: 'map', action: 'create' },
        { obj: birds, type: 'map', action: 'set', key: 'wrens', value: 3 },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'birds', value: birds, link: true },
      ]
      const diffs2: Diff[] = [{ obj: birds, type: 'map', action: 'set', key: 'sparrows', value: 15 }]
      const doc1 = Frontend.applyPatch(Frontend.init<TestType.AnimalMap>(), { diffs: diffs1 })
      const doc2 = Frontend.applyPatch(doc1, { diffs: diffs2 })
      assert.deepEqual(doc1, { birds: { wrens: 3 } } as TestType.AnimalMap)
      assert.deepEqual(doc2, { birds: { wrens: 3, sparrows: 15 } } as TestType.AnimalMap)
    })

    it('should apply updates inside map key conflicts', () => {
      const birds1 = uuid()
      const birds2 = uuid()
      const actor = uuid()
      const diffs1: Diff[] = [
        { obj: birds1, type: 'map', action: 'create' },
        { obj: birds1, type: 'map', action: 'set', key: 'wrens', value: 3 },
        { obj: birds2, type: 'map', action: 'create' },
        { obj: birds2, type: 'map', action: 'set', key: 'blackbirds', value: 1 },
        {
          obj: ROOT_ID,
          type: 'map',
          action: 'set',
          key: 'birds',
          value: birds1,
          link: true,
          conflicts: [{ actor, value: birds2, link: true }],
        },
      ]
      const diffs2: Diff[] = [{ obj: birds2, type: 'map', action: 'set', key: 'blackbirds', value: 2 }]
      const doc1 = Frontend.applyPatch(Frontend.init<TestType.AnimalMap>(), { diffs: diffs1 })
      const doc2 = Frontend.applyPatch(doc1, { diffs: diffs2 })
      assert.deepEqual(doc1, { birds: { wrens: 3 } } as TestType.AnimalMap)
      assert.deepEqual(doc2, { birds: { wrens: 3 } } as TestType.AnimalMap)
      assert.deepEqual(Frontend.getConflicts(doc1, 'birds'), { [actor]: { blackbirds: 1 } })
      assert.deepEqual(Frontend.getConflicts(doc2, 'birds'), { [actor]: { blackbirds: 2 } })
    })

    it('should structure-share unmodified objects', () => {
      const birds = uuid()
      const mammals = uuid()
      const diffs1: Diff[] = [
        { obj: birds, type: 'map', action: 'create' },
        { obj: birds, type: 'map', action: 'set', key: 'wrens', value: 3 },
        { obj: mammals, type: 'map', action: 'create' },
        { obj: mammals, type: 'map', action: 'set', key: 'badgers', value: 1 },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'birds', value: birds, link: true },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'mammals', value: mammals, link: true },
      ]
      const diffs2: Diff[] = [{ obj: birds, type: 'map', action: 'set', key: 'sparrows', value: 15 }]
      const doc1: TestType.AnimalMap = Frontend.applyPatch<TestType.AnimalMap>(Frontend.init(), { diffs: diffs1 })
      const doc2: TestType.AnimalMap = Frontend.applyPatch<TestType.AnimalMap>(doc1, { diffs: diffs2 })
      const expected1: TestType.AnimalMap = { birds: { wrens: 3 }, mammals: { badgers: 1 } }
      const expected2: TestType.AnimalMap = { birds: { wrens: 3, sparrows: 15 }, mammals: { badgers: 1 } }
      assert.deepEqual(doc1, expected1)
      assert.deepEqual(doc2, expected2)
      assert.strictEqual(doc1.mammals, doc2.mammals)
    })

    it('should delete keys in maps', () => {
      const diffs1: Diff[] = [
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'magpies', value: 2 },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'sparrows', value: 15 },
      ]
      const diffs2: Diff[] = [{ obj: ROOT_ID, type: 'map', action: 'remove', key: 'magpies' }]
      const doc1: TestType.CountMap = Frontend.applyPatch(Frontend.init<TestType.CountMap>(), { diffs: diffs1 })
      const doc2: TestType.CountMap = Frontend.applyPatch(doc1, { diffs: diffs2 })
      assert.deepEqual(doc1, { magpies: 2, sparrows: 15 } as TestType.CountMap)
      assert.deepEqual(doc2, { sparrows: 15 } as TestType.CountMap)
    })

    it('should create lists', () => {
      const birds = uuid()
      const actor = uuid()
      const diffs: Diff[] = [
        { obj: birds, type: 'list', action: 'create' },
        { obj: birds, type: 'list', action: 'insert', index: 0, value: 'chaffinch', elemId: `${actor}:1` },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'birds', value: birds, link: true },
      ]
      const doc: TestType.BirdList = Frontend.applyPatch(Frontend.init<TestType.BirdList>(), { diffs })
      assert.deepEqual(doc, { birds: ['chaffinch'] } as TestType.BirdList)
    })

    it('should apply updates inside lists', () => {
      const birds = uuid(),
        actor = uuid()
      const diffs1: Diff[] = [
        { obj: birds, type: 'list', action: 'create' },
        { obj: birds, type: 'list', action: 'insert', index: 0, value: 'chaffinch', elemId: `${actor}:1` },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'birds', value: birds, link: true },
      ]
      const diffs2: Diff[] = [{ obj: birds, type: 'list', action: 'set', index: 0, value: 'greenfinch' }]
      const doc1: TestType.BirdList = Frontend.applyPatch(Frontend.init<TestType.BirdList>(), { diffs: diffs1 })
      const doc2: TestType.BirdList = Frontend.applyPatch(doc1, { diffs: diffs2 })
      assert.deepEqual(doc1, { birds: ['chaffinch'] } as TestType.BirdList)
      assert.deepEqual(doc2, { birds: ['greenfinch'] } as TestType.BirdList)
    })

    it('should apply updates inside list element conflicts', () => {
      interface BirdSightings {
        birds: {
          species: string
          numSeen: number
        }[]
      }
      const birds = uuid()
      const item1 = uuid()
      const item2 = uuid()
      const actor = uuid()
      const diffs1: Diff[] = [
        { obj: item1, type: 'map', action: 'create' },
        { obj: item1, type: 'map', action: 'set', key: 'species', value: 'lapwing' },
        { obj: item1, type: 'map', action: 'set', key: 'numSeen', value: 2 },
        { obj: item2, type: 'map', action: 'create' },
        { obj: item2, type: 'map', action: 'set', key: 'species', value: 'woodpecker' },
        { obj: item2, type: 'map', action: 'set', key: 'numSeen', value: 1 },
        { obj: birds, type: 'list', action: 'create' },
        {
          obj: birds,
          type: 'list',
          action: 'insert',
          index: 0,
          value: item1,
          link: true,
          elemId: `${actor}:1`,
          conflicts: [{ actor, value: item2, link: true }],
        },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'birds', value: birds, link: true },
      ]
      const diffs2: Diff[] = [{ obj: item2, type: 'map', action: 'set', key: 'numSeen', value: 2 }]
      const doc1: BirdSightings = Frontend.applyPatch(Frontend.init<BirdSightings>(), { diffs: diffs1 })
      const doc2: BirdSightings = Frontend.applyPatch(doc1, { diffs: diffs2 })
      assert.deepEqual(doc1, { birds: [{ species: 'lapwing', numSeen: 2 }] } as BirdSightings)
      assert.deepEqual(doc2, { birds: [{ species: 'lapwing', numSeen: 2 }] } as BirdSightings)
      assert.strictEqual(doc1.birds[0], doc2.birds[0])
      assert.deepEqual(Frontend.getConflicts(doc1.birds, 0), { [actor]: { species: 'woodpecker', numSeen: 1 } })
      assert.deepEqual(Frontend.getConflicts(doc2.birds, 0), { [actor]: { species: 'woodpecker', numSeen: 2 } })
    })

    it('should delete list elements', () => {
      const birds = uuid(),
        actor = uuid()
      const diffs1: Diff[] = [
        { obj: birds, type: 'list', action: 'create' },
        { obj: birds, type: 'list', action: 'insert', index: 0, value: 'chaffinch', elemId: `${actor}:1` },
        { obj: birds, type: 'list', action: 'insert', index: 1, value: 'goldfinch', elemId: `${actor}:2` },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'birds', value: birds, link: true },
      ]
      const diffs2: Diff[] = [{ obj: birds, type: 'list', action: 'remove', index: 0 }]
      const doc1: TestType.BirdList = Frontend.applyPatch(Frontend.init<TestType.BirdList>(), { diffs: diffs1 })
      const doc2: TestType.BirdList = Frontend.applyPatch(doc1, { diffs: diffs2 })
      assert.deepEqual(doc1, { birds: ['chaffinch', 'goldfinch'] } as TestType.BirdList)
      assert.deepEqual(doc2, { birds: ['goldfinch'] } as TestType.BirdList)
    })

    it('should apply updates at different levels of the object tree', () => {
      interface BirdSpeciesCounts {
        counts: TestType.CountMap
        details: { species: string; family: string }[]
      }
      const counts = uuid()
      const details = uuid()
      const detail1 = uuid()
      const actor = uuid()
      const diffs1: Diff[] = [
        { obj: counts, type: 'map', action: 'create' },
        { obj: counts, type: 'map', action: 'set', key: 'magpies', value: 2 },
        { obj: detail1, type: 'map', action: 'create' },
        { obj: detail1, type: 'map', action: 'set', key: 'species', value: 'magpie' },
        { obj: detail1, type: 'map', action: 'set', key: 'family', value: 'corvidae' },
        { obj: details, type: 'list', action: 'create' },
        { obj: details, type: 'list', action: 'insert', index: 0, value: detail1, link: true, elemId: `${actor}:1` },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'counts', value: counts, link: true },
        { obj: ROOT_ID, type: 'map', action: 'set', key: 'details', value: details, link: true },
      ]
      const diffs2: Diff[] = [
        { obj: counts, type: 'map', action: 'set', key: 'magpies', value: 3 },
        { obj: detail1, type: 'map', action: 'set', key: 'species', value: 'Eurasian magpie' },
      ]
      const doc1: BirdSpeciesCounts = Frontend.applyPatch(Frontend.init<BirdSpeciesCounts>(), { diffs: diffs1 })
      const doc2: BirdSpeciesCounts = Frontend.applyPatch(doc1, { diffs: diffs2 })
      assert.deepEqual(doc1, {
        counts: { magpies: 2 },
        details: [{ species: 'magpie', family: 'corvidae' }],
      } as BirdSpeciesCounts)
      assert.deepEqual(doc2, {
        counts: { magpies: 3 },
        details: [{ species: 'Eurasian magpie', family: 'corvidae' }],
      } as BirdSpeciesCounts)
    })
  })
})
