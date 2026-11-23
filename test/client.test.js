import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

test('public client exposes only plugin settings without registering a conversation.view tab', async () => {
  const slots = []
  let module
  vm.runInNewContext(readFileSync(new URL('../assets/client.js', import.meta.url), 'utf8'), {
    window: {
      __ModuleLoader__: {
        load: entry => {
          module = entry.factory(name => {
            assert.equal(name, 'react')
            return React
          })
        },
      },
    },
    navigator: { language: 'en' },
    console,
  })
  const ctx = {
    slots: {
      inject: (_name, fn) => fn(),
      register: (definition, component) => {
        slots.push({ definition, component })
      },
    },
  }
  module.apply(ctx)
  assert.equal(slots.some(s => s.definition.name === 'conversation.view'), false, 'Antigravity plugin must not register a conversation.view tab')
  const settings = slots.find(s => s.definition.name === 'plugins.row.config')
  assert.ok(settings, 'plugins.row.config settings form remains available')
  let operations, revision
  const form = {
    state: { status: 'ready', writable: true, revision: 7, value: { transport: 'headless' } },
    mutate: async (ops, rev) => {
      operations = ops
      revision = rev
      return true
    },
  }
  let config
  await act(async () => {
    config = TestRenderer.create(React.createElement(settings.component, { view: 'edit', form }))
  })
  await act(async () => {
    config.root.findAllByType('input')[0].props.onChange({ target: { value: '/opt/agy' } })
  })
  await act(async () => {
    config.root.findAllByType('input')[2].props.onChange({ target: { value: 'gemini-pro-orchestrator-neon' } })
  })
  await act(async () => {
    config.root.findAllByType('select').find(s => s.props.value === 'native').props.onChange({ target: { value: 'subagents' } })
  })
  await act(async () => {
    await config.root.findAllByType('button').find(b => b.children.includes('Save')).props.onClick()
  })
  assert.equal(revision, 7)
  assert.equal(operations.find(o => o.path[0] === 'command').value, '/opt/agy')
  assert.equal(operations.find(o => o.path[0] === 'model').value, 'gemini-pro-orchestrator-neon')
  assert.equal(operations.find(o => o.path[0] === 'effort').value, '')
  assert.equal(operations.find(o => o.path[0] === 'native').value.mode, 'subagents')
  await act(async () => {
    config.unmount()
  })
})
