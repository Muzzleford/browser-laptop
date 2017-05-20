/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
/* global describe, before, after, it */

const mockery = require('mockery')
const assert = require('assert')
const sinon = require('sinon')
const Immutable = require('immutable')
const urlParse = require('url').parse
const {makeImmutable} = require('../../../../../app/common/state/immutableUtil')
const fakeElectron = require('../../../lib/fakeElectron')
const _ = require('underscore')
let suggestion
require('../../../braveUnit')

const AGE_DECAY = 50

const fakeImmutableUtil = Object.assign({
  makeImmutable: (obj) => {
    return makeImmutable(obj)
  },
  isList: (obj) => {
    return Immutable.List.isList(obj)
  }
}, require('../../../../../app/common/state/immutableUtil'))

describe('suggestion unit tests', function () {
  let makeImmutableSpy

  before(function () {
    mockery.enable({
      warnOnReplace: false,
      warnOnUnregistered: false,
      useCleanCache: true
    })

    makeImmutableSpy = sinon.spy(fakeImmutableUtil, 'makeImmutable')
    mockery.registerMock('../../common/state/immutableUtil', fakeImmutableUtil)
    mockery.registerMock('electron', fakeElectron)
    suggestion = require('../../../../../app/common/lib/suggestion')
  })

  after(function () {
    makeImmutableSpy.restore()
    mockery.disable()
  })

  describe('normalizeLocation', function () {
    it('does nothing when input is not a string', function () {
      assert.equal(suggestion.normalizeLocation(), undefined)
      assert.equal(suggestion.normalizeLocation(undefined), undefined)
      assert.equal(suggestion.normalizeLocation(null), null)
      assert.equal(suggestion.normalizeLocation(3), 3)
      assert.equal(suggestion.normalizeLocation(3.3), 3.3)
    })

    it('normalizes location', function () {
      assert.ok(suggestion.normalizeLocation('https://www.site.com') === 'site.com', 'www. prefix removed')
      assert.ok(suggestion.normalizeLocation('http://site.com') === 'site.com', 'location not modified')
    })
  })

  describe('sortingPriority', function () {
    it('sorts sites correctly', function () {
      assert.ok(suggestion.sortingPriority(10, 100, 50, AGE_DECAY) > suggestion.sortingPriority(10, 100, 40, AGE_DECAY), 'newer sites with equal access counts sort earlier')
      assert.ok(suggestion.sortingPriority(10, 100, 50, AGE_DECAY) < suggestion.sortingPriority(11, 100, 40, AGE_DECAY), 'Sites with higher access counts sort earlier (unless time delay overriden)')
      assert.ok(suggestion.sortingPriority(10, 10000000000, 10000000000, AGE_DECAY) > suggestion.sortingPriority(11, 10000000000, 1000000000, AGE_DECAY), 'much newer sites without lower counts sort with higher priority')
    })
  })

  describe('isSimpleDomainNameValue', function () {
    it('sorts simple sites higher than complex sites', function () {
      const siteSimple = Immutable.Map({ location: 'http://www.site.com' })
      const siteComplex = Immutable.Map({ location: 'http://www.site.com/?foo=bar#a' })
      assert.ok(suggestion.isSimpleDomainNameValue(siteSimple) === true, 'simple site returns 1')
      assert.ok(suggestion.isSimpleDomainNameValue(siteComplex) === false, 'complex site returns 0')
    })
  })

  describe('shouldNormalizeLocation', function () {
    it('Determines prefixes which should be normalized', function () {
      const prefixes = ['http://', 'https://', 'www.']
      prefixes.forEach((prefix) => {
        for (let i = 0; i < prefix.length; i++) {
          const substring = prefix.substring(0, i + 1)
          assert.equal(suggestion.shouldNormalizeLocation(substring), false)
        }
      })
    })

    it('Determines prefixes which should NOT be normalized', function () {
      const prefixes = ['httphttp', 'brave.com', 'www3', 'http://www.x']
      prefixes.forEach((prefix) => {
        assert.equal(suggestion.shouldNormalizeLocation(prefix), true)
      })
    })
  })

  describe('createVirtualHistoryItems', function () {
    const site1 = Immutable.Map({
      location: 'http://www.foo.com/1',
      count: 0,
      lastAccessedTime: 0,
      title: 'www.foo/com/1'
    })

    const site2 = Immutable.Map({
      location: 'http://www.foo.com/2',
      count: 0,
      lastAccessedTime: 0,
      title: 'www.foo/com/2'
    })

    const site3 = Immutable.Map({
      location: 'http://www.foo.com/3',
      count: 0,
      lastAccessedTime: 0,
      title: 'www.foo/com/3'
    })

    it('handles input being null/undefined', function () {
      const emptyResult = Immutable.Map()
      assert.deepEqual(suggestion.createVirtualHistoryItems(), emptyResult)
      assert.deepEqual(suggestion.createVirtualHistoryItems(undefined), emptyResult)
      assert.deepEqual(suggestion.createVirtualHistoryItems(null), emptyResult)
    })

    it('handles entries with unparseable "location" field', function () {
      const badInput = makeImmutable({
        site1: {
          location: undefined
        },
        site2: {
          location: null
        },
        site3: {
          location: ''
        },
        site4: {
          location: 'httphttp://lol.com'
        }
      })
      assert.ok(suggestion.createVirtualHistoryItems(badInput))
    })

    it('calls immutableUtil.makeImmutable', function () {
      const callCount = makeImmutableSpy.withArgs({}).callCount
      suggestion.createVirtualHistoryItems()
      assert.equal(makeImmutableSpy.withArgs({}).callCount, callCount + 1)
    })

    it('shows virtual history item', function () {
      var history = Immutable.List([site1, site2, site3])
      var virtual = suggestion.createVirtualHistoryItems(history).toJS()
      var keys = _.keys(virtual)
      assert.ok(keys.length > 0, 'virtual location created')
      assert.ok(virtual[keys[0]].location === 'http://www.foo.com')
      assert.ok(virtual[keys[0]].title === 'www.foo.com')
      assert.ok(virtual[keys[0]].lastAccessedTime > 0)
    })
  })

  describe('sorting functions', function () {
    describe('getSortByPath', function () {
      before(function () {
        this.sort = suggestion.getSortByPath('twitter')
      })
      it('returns 0 when both paths contain the string', function () {
        assert.equal(this.sort('https://brave.com/twitter', 'https://brianbondy.com/twitter'), 0)
      })
      it('returns 0 when neihter path contain the string', function () {
        assert.equal(this.sort('https://brave.com/facebook', 'https://brianbondy.com/facebook'), 0)
      })
      it('returns -1 when the first site contains the string only', function () {
        assert.equal(this.sort('https://brave.com/twitter', 'https://brianbondy.com/facebook'), -1)
      })
      it('returns 1 when the second site contains the string only', function () {
        assert.equal(this.sort('https://brave.com/facebook', 'https://brianbondy.com/twitter'), 1)
      })
      it('matches even domain name for input string', function () {
        assert.equal(this.sort('https://brave.com/facebook', 'https://twitter.com'), 1)
      })
    })
    describe('sortBySimpleURL', function () {
      before(function () {
        this.sort = (url1, url2) => {
          return suggestion.sortBySimpleURL(
            { location: url1, parsedUrl: urlParse(url1) },
            { location: url2, parsedUrl: urlParse(url2) }
          )
        }
      })
      it('returns 0 when both paths are simple', function () {
        assert.equal(this.sort('https://brave.com', 'https://brianbondy.com'), 0)
      })
      it('returns 0 when neihter path is simple', function () {
        assert.equal(this.sort('https://brave.com/facebook', 'https://brianbondy.com/facebook'), 0)
      })
      it('returns -1 when the first site is simple only', function () {
        assert.equal(this.sort('https://brave.com', 'https://brianbondy.com/facebook'), -1)
      })
      it('returns 1 when the second site is simple only', function () {
        assert.equal(this.sort('https://brave.com/facebook', 'https://brianbondy.com'), 1)
      })
      it('trailing slash is considered simple', function () {
        assert.equal(this.sort('https://brave.com/', 'https://twitter.com'), 0)
      })
      it('trailing hash is considered simple', function () {
        assert.equal(this.sort('https://brave.com/#', 'https://twitter.com'), 0)
      })
      it('Prefers https sipmle URLs', function () {
        assert(this.sort('https://brave.com', 'http://brave.com') < 0)
      })
    })
    describe('getSortByDomain', function () {
      before(function () {
        const userInputLower = 'google.c'
        const userInputParts = userInputLower.split('/')
        const userInputHost = userInputParts[0]
        const internalSort = suggestion.getSortByDomain(userInputLower, userInputHost)
        this.sort = (url1, url2) => {
          return internalSort(
            { location: url1, parsedUrl: urlParse(url1) },
            { location: url2, parsedUrl: urlParse(url2) }
          )
        }
      })
      it('negative if only first has a matching domain', function () {
        assert(this.sort('https://google.com', 'https://www.brianbondy.com') < 0)
      })
      it('positive if only second has a matching domain', function () {
        assert(this.sort('https://www.brianbondy.com', 'https://google.com') > 0)
      })
      it('0 if both have a matching domain from index 0', function () {
        assert.equal(this.sort('https://google.com', 'https://google.ca'), 0)
      })
      it('0 if neither has a matching domain', function () {
        assert.equal(this.sort('https://brianbondy.com', 'https://clifton.io/'), 0)
      })
      it('negative if first site has a match from the start of domain', function () {
        assert(this.sort('https://google.com', 'https://mygoogle.com') < 0)
      })
      it('positive if second site has a match but without www.', function () {
        assert(this.sort('https://www.google.com', 'https://google.com') > 0)
      })
      it('negative if there is a pos 0 match not including www.', function () {
        assert(this.sort('https://www.google.com', 'https://mygoogle.com') < 0)
      })
      it('simple domain gets matched higher', function () {
        assert(this.sort('https://www.google.com', 'https://www.google.com/extra') < 0)
      })
      it('does not throw error for file:// URL', function () {
        assert(this.sort('https://google.com', 'file://') < 0)
      })
    })
    describe('getSortForSuggestions', function () {
      describe('with url entered as path', function () {
        before(function () {
          const userInputLower = 'brianbondy.com/projects'
          const userInputParts = userInputLower.split('/')
          const userInputHost = userInputParts[0]
          const internalSort = suggestion.getSortForSuggestions(userInputLower, userInputHost)
          this.sort = (url1, url2) => {
            return internalSort(
              { location: url1, parsedUrl: urlParse(url1) },
              { location: url2, parsedUrl: urlParse(url2) }
            )
          }
        })
        it('returns 0 when both urls are the same', function () {
          assert.equal(this.sort('https://www.google.com', 'https://www.google.com'), 0)
        })
        it('matches exact path if more specific path is specified', function () {
          assert(this.sort('https://brianbondy.com', 'https://www.brianbondy.com/projects/2') > 0)
        })
      })
      describe('with single string entered', function () {
        before(function () {
          const userInputLower = 'brianbondy.c'
          const userInputParts = userInputLower.split('/')
          const userInputHost = userInputParts[0]
          const internalSort = suggestion.getSortForSuggestions(userInputLower, userInputHost)
          this.sort = (url1, url2) => {
            return internalSort(
              { location: url1, parsedUrl: urlParse(url1) },
              { location: url2, parsedUrl: urlParse(url2) }
            )
          }
        })
        it('matches on domain name first', function () {
          assert(this.sort('https://www.brianbondy.com', 'https://www.google.com/brianbondy.co') < 0)
        })
        it('matches with or without protocol', function () {
          assert(this.sort('https://www.2brianbondy.com', 'http://www.brianbondy.com') > 0)
          assert(this.sort('https://brianbondy.com', 'www.brianbondy.com') < 0)
        })
        it('non-wwww. matches before www.', function () {
          assert(this.sort('https://brianbondy.com', 'www.brianbondy.com') < 0)
        })
      })
    })
  })
})