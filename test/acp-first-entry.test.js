import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { apply } from '../lib/index.js'

const require=createRequire(import.meta.url),h=React.createElement
const source=readFileSync(new URL('../assets/acp-client.js',import.meta.url),'utf8')

// Exercise the exact TS/TSX sources shipped by rc.3. Node cannot strip types in
// node_modules; transpilation leaves the real assembler and shell guards intact.
// Only CSS, presentation primitives and observable notifications are supplied by
// the renderer fixture; no fabricated "started" flag or parent turn is involved.
const modules=new Map()
const observable=initial=>{
  let value=initial;const listeners=new Set()
  return {getSnapshot:()=>value,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},set:next=>{value=next;for(const listener of listeners)listener()}}
}
const fixtures={
  '@deepseek-ai/dsh-client-store':{createSnapshotStore:observable,notifySubscribers:listeners=>{for(const listener of listeners)listener()}},
  '@deepseek-ai/dsh-client-ui-primitives':{
    Button:props=>h('button',props),Tooltip:({children})=>h(React.Fragment,null,children),
    Menu:({children,anchor,open})=>h(React.Fragment,null,anchor,open?children:null),IconEllipsisOutlineRegular:()=>null,
  },
  clsx:(...values)=>values.filter(Boolean).join(' '),
}
function publishedSource(name){
  const file=name.startsWith('/')?name:require.resolve(name)
  if(modules.has(file))return modules.get(file).exports
  if(!/\.tsx?$/.test(file))return require(file)
  const module={exports:{}};modules.set(file,module)
  const code=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
  const load=specifier=>{
    if(specifier.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_target,key)=>String(key)})}
    if(Object.hasOwn(fixtures,specifier))return fixtures[specifier]
    if(specifier.startsWith('.'))return publishedSource(resolve(dirname(file),specifier))
    return require(specifier)
  }
  vm.compileFunction(code,['require','module','exports'],{filename:file})(load,module,module.exports)
  return module.exports
}
const {ConversationNodeAssembler}=publishedSource('@deepseek-ai/dsh-client-ui-conversation/src/client/conversation/assembler.ts')
const {conversationPhase}=publishedSource('@deepseek-ai/dsh-client-ui-conversation/src/client/contract/snapshot.ts')
const {ConversationHeader}=publishedSource('@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationHeader.tsx')
const {ConversationSessionHeader}=publishedSource('@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationSession.tsx')
const {DefaultConversationViews}=publishedSource('@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/DefaultConversationViews.tsx')
const {applySessionListMetadata}=publishedSource('@deepseek-ai/dsh-api-session-controller/src/list.ts')

test('the published blank-session shell exposes ACP after the human entry command without a model turn',async t=>{
  const host=new Context();t.after(()=>host.fiber.dispose())
  await host.plugin(TypertRegistry);await host.plugin(SessionStore);await host.plugin(SessionProjectionRegistry);await host.plugin(CommandRuntime)
  host.provide('workingDirectory',{get:()=>process.cwd()})
  apply(host,{})
  const session=host.sessions.create('first-use',{meta:{cwd:process.cwd()}}),agent={id:session.id,session,ctx:host}
  const definitions=[],targets=[],providers=[],registered=[],cleanup=[],calls=[]
  let assembler
  const owner={sessionId:session.id}
  const ctx={
    effect:body=>{const dispose=body();cleanup.push(dispose);return dispose},
    inject:(dependencies,body)=>{
      if(dependencies.includes('uiConversation'))body({uiConversation:{
        events:{register:definition=>definitions.push(definition)},views:{register:definition=>targets.push(definition)},
        binding:actual=>{assert.equal(actual,owner);return {activate:target=>assembler.activateTarget(target)}},
      },uiSession:{provide:provider=>providers.push(provider)}})
      else body(ctx)
      return Promise.resolve()
    },
    slots:{inject:(_name,body)=>body(),register:(definition,Component)=>registered.push({definition,Component})},
    remote:{$mount:async()=>{},antigravityAcp:{action:async(id,input)=>{
      calls.push({id,input})
      return {ok:true,value:input.action==='defaults'?{protocol:2,transport:'acp'}:{protocol:2,sessions:[]}}
    }}},
  }
  const factory=vm.runInNewContext(source+'\ncreateAntigravityAcpClient',{navigator:{language:'en'},URL,setInterval:()=>1,clearInterval(){}})(()=>React)
  factory.apply(ctx)
  assembler=new ConversationNodeAssembler({entries:()=>definitions,fallbackEntry:()=>undefined},{entries:()=>targets})
  assembler.replaceWindow([],false);for(const provider of providers)provider.resolve(owner);assembler.flush()
  assert.equal(definitions.length,1);assert.equal(targets.length,1)
  const view=registered[0],store=view.definition.store.create(),binding=view.definition.inject(session.id,store.actions)
  let events=[],metadata={blank:true,lastPromptAt:null},selected='chat'
  const sessionSnapshot=()=>({...metadata,running:false,promptAttempted:false,awaitingFirstTurn:false})
  const conversation=()=>({views:assembler,activeTargets:assembler.activityTargets()})
  const tabs=[{id:'chat',label:'Chat'},{id:'antigravity',label:'Antigravity'}]
  const Acp=()=>{
    const snapshot=React.useSyncExternalStore(store.subscribe,store.getSnapshot)
    return h(view.Component,{...binding,actions:store.actions,useStore:selector=>selector(snapshot)})
  }
  let renderer
  const Panel=()=>{
    const useStore=selector=>selector({view:selected,viewRequest:null})
    const useConversationViews=selector=>selector(tabs)
    const useSession=selector=>selector(sessionSnapshot()),useConversation=selector=>selector(conversation())
    const header=props=>h(ConversationSessionHeader,{...props,sessionId:session.id,
      useSessions:selector=>selector({byId:{[session.id]:{id:session.id,displayTitle:'First use',origin:'session'}}}),
      useConversationViews,useStore,renderSlot:()=>null,renderFactorySlot:()=>null,open(){},
      useContextMenu:()=>({getTriggerProps:()=>({})}),selectView:id=>{selected=id;renderer.update(h(Panel))},setPinned(){},t:key=>key,
      useEntryPins:selector=>selector([]),useEntryActions:selector=>selector(false),
    })
    return h(React.Fragment,null,h(ConversationHeader,{sessionId:session.id,useSession,useConversation,renderSlot:(name,props)=>name==='conversation.session.header'?header(props):null}),
      h(DefaultConversationViews,{useSession,useConversation,useConversationViews,useInspectCall:selector=>selector(undefined),useStore,
        actions:{setDraft(){},completeViewRequest(){}},inputActions:{persistDraft(){}},bindDraftPersistence:()=>()=>{},openView(){},
        renderSlot:(_name,_props,selection)=>selection.only==='antigravity'?h(Acp):h('div',null,'Chat'),
      }))
  }
  await act(async()=>{renderer=TestRenderer.create(h(Panel))})
  assert.equal(conversationPhase(sessionSnapshot(),conversation()),'blank')
  assert.equal(renderer.root.findAllByProps({role:'tab'}).length,0)
  assert.equal(calls.length,0,'blank shell does not dispatch ACP work')
  const result=await host.commands.execute(agent,'/antigravity',[],new AbortController().signal)
  assert.equal(result.result.kind,'success')
  events=session.snapshotEvents()
  assert.deepEqual(events.map(event=>event.type),['command/run','command/done'])
  metadata=events.reduce(applySessionListMetadata,metadata)
  assert.equal(metadata.blank,true,'the host still has no parent model turn')
  assembler.replaceWindow(events.map(event=>({type:'event',event})),false);assembler.flush()
  assert.equal(conversationPhase(sessionSnapshot(),conversation()),'active')
  await act(async()=>renderer.update(h(Panel)))
  const tab=renderer.root.findAllByProps({role:'tab'}).find(node=>node.findAllByType('span').some(child=>child.children.includes('Antigravity')))
  assert.ok(tab,'the real rc.3 header now exposes the ACP tab')
  await act(async()=>tab.props.onClick())
  assert.ok(renderer.root.findAllByType('button').some(node=>node.children.includes('New isolated session')))
  assert.ok(calls.some(call=>call.id===session.id&&call.input.action==='defaults'))
  assert.equal(calls.some(call=>['connect','prompt','login-start'].includes(call.input.action)),false,'opening the tab does not infer, connect or change login')
  assert.deepEqual(session.snapshotEvents(),events,'view entry never appends fabricated turns or messages')
  await act(async()=>renderer.unmount())
  for(const dispose of cleanup.reverse())dispose()
})

test('Flywheel uses its own human command and entry target through the same public factory',()=>{
  let definition,target,provider,activated
  const ctx={on(){},inject:(dependencies,body)=>{
    if(dependencies.includes('uiConversation'))body({uiConversation:{views:{register:value=>{target=value}},events:{register:value=>{definition=value}},binding:()=>({activate:value=>{activated=value}})},uiSession:{provide:value=>{provider=value}}})
    else body(ctx)
    return Promise.resolve()
  },slots:{inject:(_name,body)=>body(),register(){}},remote:{$mount:async()=>{},antigravityAcp:{action:async()=>({ok:true,value:{protocol:2}})}}}
  vm.runInNewContext(source+'\ncreateAntigravityAcpClient',{})(()=>React).apply(ctx,{viewId:'flywheel-antigravity'})
  provider.resolve({sessionId:'flywheel-first-use'})
  assert.equal(activated,'flywheel-antigravity')
  assert.equal(target.target,'flywheel-antigravity')
  assert.equal(target.isActive(target.create().empty),false)
  const event=name=>({type:'command/run',data:{name,commandId:'entry',source:{kind:'user'}}})
  assert.equal(definition.match(event('antigravity')),null)
  assert.equal(definition.match(event('flywheel')),null)
  assert.equal(definition.match(event('flywheel-antigravity')).role,'start')
})
