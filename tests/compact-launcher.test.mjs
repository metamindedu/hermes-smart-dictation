import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {contextualMicRule,compactMicStyle,compactArrowStyle} from '../src/compact-launcher.mjs'

const anchor=(id,label,pressed='false')=>`<span data-slot="fan-menu-anchor" id="${id}"><button aria-label="${label}" aria-pressed="${pressed}"></button></span>`
test('contextual presentation hides only its own idle Core mic and fails open otherwise',()=>{
 const dom=new JSDOM(`<form data-slot="composer-root" id="contextual"><span data-smart-dictation-control="contextual"></span>${anchor('idle','Voice dictation')}${anchor('recording','Stop dictation','true')}${anchor('transcribing','Transcribing dictation','true')}<button aria-label="Start voice conversation">wave</button><button data-smart-dictation-launcher>plugin</button></form><form data-slot="composer-root" id="native">${anchor('neighbour','Voice dictation')}</form><aside>${anchor('outside','Voice dictation')}</aside>`)
 const doc=dom.window.document,selector=contextualMicRule('Voice dictation').split(' {')[0]
 assert.deepEqual([...doc.querySelectorAll(selector)].map(n=>n.id),['idle'])
 assert.ok(doc.querySelector('[aria-label="Start voice conversation"]'))
 assert.ok(doc.querySelector('[data-smart-dictation-launcher]'))
 doc.querySelector('[data-smart-dictation-control]').remove()
 assert.equal(doc.querySelectorAll(selector).length,0,'Native workflow/disabled/unmounted launcher restores Core visibility')
 dom.window.close()
})
test('localized mic matching and compatibility fallbacks do not widen the selector',()=>{
 const dom=new JSDOM(`<form data-slot="composer-root"><span data-smart-dictation-control="contextual"></span>${anchor('ko','음성 받아쓰기')}${anchor('en','Voice dictation')}${anchor('active','음성 받아쓰기','true')}</form>`)
 const selector=contextualMicRule('음성 받아쓰기').split(' {')[0]
 assert.deepEqual([...dom.window.document.querySelectorAll(selector)].map(n=>n.id),['ko'])
 for(const label of [null,undefined,'',' ',{},'bad\nlabel'])assert.equal(contextualMicRule(label),'')
 dom.window.document.querySelector('[data-slot="composer-root"]').removeAttribute('data-slot')
 assert.equal(dom.window.document.querySelectorAll(selector).length,0,'unknown host markup is left visible')
 assert.ok(!contextualMicRule('</style>').includes('</style>'))
 dom.window.close()
})
test('compact toolbar footprint is fixed and independent of translated labels',()=>{
 assert.equal(compactMicStyle.width,28)
 assert.equal(compactArrowStyle.width,20)
 assert.equal(compactMicStyle.width+1+compactArrowStyle.width,49)
 assert.equal(compactMicStyle.flexShrink,0)
})
