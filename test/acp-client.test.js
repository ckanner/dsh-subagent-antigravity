import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const source=readFileSync(new URL('../assets/acp-client.js',import.meta.url),'utf8')
function load(timers={}) {
  return vm.runInNewContext(source+'\ncreateAntigravityAcpClient',{
    navigator:{language:'en'},URL,crypto:webcrypto,console,TextEncoder,btoa,
    setInterval:fn=>{timers.poll=fn;return 1},clearInterval:()=>{timers.poll=null},
  })(name=>{assert.equal(name,'react');return React})
}
const copy=value=>JSON.parse(JSON.stringify(value))
const base=()=>({protocol:2,transport:'official-cli-acp',id:'record-1',owner:'host-a',sourceCwd:'/project',cwd:'/isolated/work',branch:'acp/session-1',baseCommit:'abc123',revision:1,status:'ready',connection:'connected',sessionId:'native-1',canPrompt:true,
  configOptions:[{id:'model',name:'Model',category:'model',type:'select',currentValue:'gemini-native',options:[{value:'gemini-native',name:'Gemini native'},{value:'claude-native',name:'Claude native'}]}],modes:{currentModeId:'default',availableModes:[{id:'default',name:'Default'},{id:'plan',name:'Plan'}]},
  messages:[],tools:[],children:[],permissions:[],plan:[],knownWork:{tools:0,permissions:0,children:0,unknown:false},cleanup:{process:'running',session:'open'}})
function harness(handler) {
  const slots=[],calls=[],timers={},events=new Map()
  const ctx={on:(name,fn)=>events.set(name,fn),inject:(_names,fn)=>{fn(ctx);return Promise.resolve()},slots:{inject:(_name,fn)=>fn(),register:(definition,component)=>slots.push({definition,component})},remote:{
    $mount:async spec=>{ctx.descriptor=spec.descriptors[0]},commands:{execute:()=>{throw new Error('ACP must not use logged commands')}},
    antigravityAcp:{action:async(id,input)=>{calls.push({id,input:copy(input)});return {ok:true,value:await handler(id,copy(input))}}},
    },
  }
  load(timers).apply(ctx)
  const view=slots[0],store=view.definition.store.create(),binding=view.definition.inject('host-a',store.actions)
  const App=()=>{const snapshot=React.useSyncExternalStore(store.subscribe,store.getSnapshot);return React.createElement(view.component,{...binding,actions:store.actions,useStore:selector=>selector(snapshot)})}
  return {ctx,view,store,binding,App,calls,timers,events}
}
const findButton=(renderer,text)=>renderer.root.findAllByType('button').find(button=>button.children.includes(text))

test('standalone bundle contains the exact reusable ACP source',()=>{
  const bundled=readFileSync(new URL('../assets/client.js',import.meta.url),'utf8')
  assert.ok(bundled.startsWith('// BEGIN SHARED ACP CLIENT\n'+source+'// END SHARED ACP CLIENT\n'))
})

test('ACP controls use owner-bound Remote, native options and permission IDs; unmount only detaches',async()=>{
  let snapshot=base(),connected=false,login
  const f=harness(async(_owner,input)=>{
    if(input.action==='defaults')return {protocol:2,transport:'acp'}
    if(input.action==='status'&&!input.id)return {protocol:2,sessions:connected?[snapshot]:[],...(login?{login}:{})}
    if(input.action==='connect'){connected=true;return snapshot}
    if(input.action==='prompt'){snapshot={...snapshot,revision:2,prompt:{operationId:input.operationId,state:'pending'},messages:[{id:'u1',role:'user',content:input.prompt}],permissions:[{requestId:'permission-1',toolCall:{title:'Run tests'},options:[{optionId:'native-allow-id',name:'Allow once',kind:'allow_once'}]}]}}
    if(input.action==='permission'){assert.equal(input.optionId,'native-allow-id');snapshot={...snapshot,revision:3,permissions:[],tools:[{toolCallId:'t1',title:'Tests',status:'in_progress'}],knownWork:{...snapshot.knownWork,tools:1},prompt:{...snapshot.prompt,state:'completed',stopReason:'end_turn'}}}
    if(input.action==='configure'){snapshot={...snapshot,revision:snapshot.revision+1,modes:{...snapshot.modes,currentModeId:input.value}}}
    if(input.action==='login-start'){login={status:'awaiting-input',url:'https://accounts.google.com/o/oauth2/auth?state=test',cleanupConfirmed:false};return {protocol:2,login}}
    if(input.action==='login-submit'){assert.equal(input.input,'official-code');login={status:'succeeded',cleanupConfirmed:true};return {protocol:2,login}}
    return snapshot
  })
  let renderer
  await act(async()=>{renderer=TestRenderer.create(React.createElement(f.App))})
  assert.equal(f.calls[0].input.action,'defaults')
  await act(async()=>{await findButton(renderer,'New isolated session').props.onClick()})
  assert.ok(JSON.stringify(renderer.toJSON()).includes('/isolated/work'))
  assert.ok(renderer.root.findAllByType('option').find(option=>option.props.value==='claude-native').props.disabled)
  assert.equal(renderer.root.findAllByType('input').filter(input=>input.props.type==='checkbox').length,0,'no headless policy/preset toggles in ACP')
  await act(async()=>{renderer.root.findByType('textarea').props.onChange({target:{value:'interactive task'}})})
  await act(async()=>{await findButton(renderer,'Send').props.onClick()})
  const sent=f.calls.find(call=>call.input.action==='prompt')
  assert.equal(sent.id,'host-a');assert.match(sent.input.operationId,/^[a-f0-9-]{36}$/)
  assert.deepEqual(sent.input.prompt,[{type:'text',text:'interactive task'}])
  assert.equal(f.store.getSnapshot().acpDraft,'');assert.equal(Object.keys(f.store.getSnapshot().acpOperations).length,0)
  await act(async()=>{await findButton(renderer,'Allow once').props.onClick()})
  assert.ok(JSON.stringify(renderer.toJSON()).includes('in_progress'),'root completion does not finalize native tools')
  await act(async()=>{renderer.root.findAllByType('select').find(select=>select.props['aria-label']==='Mode').props.onChange({target:{value:'plan'}})})
  assert.deepEqual(f.calls.filter(call=>call.input.action==='configure').at(-1).input,{version:2,action:'configure',id:'record-1',configId:'mode',value:'plan'})
  await act(async()=>{await findButton(renderer,'Sign in with Google').props.onClick()})
  assert.match(renderer.root.findByType('a').props.href,/^https:\/\/accounts.google.com\//)
  await act(async()=>{renderer.root.findByType('input').props.onChange({target:{value:'official-code'}})})
  assert.equal(renderer.root.findByType('input').props.type,'password')
  await act(async()=>{await findButton(renderer,'Submit official sign-in code').props.onClick()})
  assert.equal(renderer.root.findAllByType('input').length,0)
  assert.equal(f.calls.filter(call=>call.input.action==='connect').length,1,'login success never sends a prompt or auto-connects')
  const count=f.calls.length
  await act(async()=>{renderer.unmount()})
  assert.equal(f.calls.length,count);assert.equal(f.timers.poll,null,'unmount stops only polling')
  assert.equal(f.ctx.descriptor.parameters[0].lookup,'agent')
})

test('uncertain sends keep the operation UUID and are never retried by polling or remount',async()=>{
  let snapshot=base(),sent
  const f=harness(async(_owner,input)=>{
    if(input.action==='defaults')return {protocol:2,transport:'acp'}
    if(input.action==='status'&&!input.id)return {protocol:2,sessions:[snapshot]}
    if(input.action==='prompt'){sent=input;throw new Error('connection interrupted')}
    return snapshot
  })
  f.store.actions.set('acpSelectedId',snapshot.id)
  let renderer
  await act(async()=>{renderer=TestRenderer.create(React.createElement(f.App))})
  await act(async()=>{renderer.root.findByType('textarea').props.onChange({target:{value:'do this once'}})})
  await act(async()=>{await findButton(renderer,'Send').props.onClick()})
  assert.equal(f.store.getSnapshot().acpOperations[snapshot.id].operationId,sent.operationId)
  assert.equal(findButton(renderer,'Send').props.disabled,true)
  await act(async()=>{await f.timers.poll()})
  await act(async()=>{renderer.unmount();renderer=TestRenderer.create(React.createElement(f.App))})
  assert.equal(f.calls.filter(call=>call.input.action==='prompt').length,1)
  snapshot={...snapshot,revision:2,prompt:{operationId:sent.operationId,state:'pending'}}
  await act(async()=>{await findButton(renderer,'Check send outcome').props.onClick()})
  assert.equal(Object.keys(f.store.getSnapshot().acpOperations).length,0)
  await act(async()=>renderer.unmount())
})

test('recycled actions cannot adopt an old conversation RPC result',async()=>{
  let release
  const f=harness(async()=>new Promise(resolve=>{release=resolve}))
  const pending=f.binding.execute({version:2,action:'list'})
  await new Promise(resolve=>setImmediate(resolve))
  f.store.actions.set('acpDraft','old conversation text')
  f.store.actions.set('acpAttachments',[{name:'old image'}])
  const other=f.view.definition.inject('host-b',f.store.actions)
  assert.notEqual(other,f.binding)
  assert.equal(f.store.getSnapshot().acpDraft,'')
  assert.equal(f.store.getSnapshot().acpAttachments.length,0)
  release({protocol:2,sessions:[]})
  await assert.rejects(pending,/binding has ended/)
  await assert.rejects(f.binding.execute({version:2,action:'list'}),/binding has ended/)
})

test('image attachments require native capability and retain frozen bytes across an uncertain send',async()=>{
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6X8sAAAAASUVORK5CYII=','base64')
  const imageFile={name:'pixel.png',type:'image/png',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer}
  let snapshot=base()
  const f=harness(async(_owner,input)=>{
    if(input.action==='defaults')return {protocol:2,transport:'acp'}
    if(input.action==='status'&&!input.id)return {protocol:2,sessions:[snapshot]}
    if(input.action==='prompt')throw new Error('unknown carrier outcome')
    return snapshot
  })
  f.store.actions.set('acpSelectedId',snapshot.id)
  let renderer
  await act(async()=>{renderer=TestRenderer.create(React.createElement(f.App))})
  assert.equal(renderer.root.findAllByType('input').filter(node=>node.props.type==='file').length,0)
  let prevented=false
  await act(async()=>{renderer.root.findByType('textarea').props.onPaste({clipboardData:{items:[{kind:'file',getAsFile:()=>imageFile}]},preventDefault:()=>{prevented=true}})})
  assert.equal(prevented,false)
  snapshot={...snapshot,revision:2,capabilities:{promptCapabilities:{image:true}}}
  await act(async()=>{await f.timers.poll()})
  const fileInput=renderer.root.findByType('input')
  const invalid={...imageFile,type:'image/svg+xml'}
  await act(async()=>{await fileInput.props.onChange({target:{files:[invalid],value:'not-a-persisted-path'}})})
  assert.equal(f.store.getSnapshot().acpAttachments.length,0)
  await act(async()=>{await fileInput.props.onChange({target:{files:[{...imageFile,size:8*1024*1024+1}],value:''}})})
  assert.equal(f.store.getSnapshot().acpAttachments.length,0)
  const event={target:{files:[imageFile],value:'C:/fakepath/pixel.png'}}
  await act(async()=>{await fileInput.props.onChange(event)})
  assert.equal(event.target.value,'')
  const attachment=f.store.getSnapshot().acpAttachments[0]
  assert.equal(attachment.data,bytes.toString('base64'))
  assert.equal(attachment.sha256,createHash('sha256').update(bytes).digest('hex'))
  assert.equal(findButton(renderer,'Send').props.disabled,false,'image-only native prompts are supported')
  await act(async()=>{const send=findButton(renderer,'Send').props.onClick;await Promise.all([send(),send()])})
  const sent=f.calls.filter(call=>call.input.action==='prompt')
  assert.equal(sent.length,1,'same-tick double clicks retain one operation')
  assert.deepEqual(sent[0].input.prompt,[{type:'image',mimeType:'image/png',data:bytes.toString('base64')}])
  const operation=f.store.getSnapshot().acpOperations[snapshot.id]
  assert.equal(operation.attachments[0].sha256,attachment.sha256)
  await act(async()=>{await findButton(renderer,'Remove').props.onClick()})
  assert.equal(f.store.getSnapshot().acpAttachments.length,0)
  assert.equal(operation.prompt[0].data,bytes.toString('base64'),'removing a draft attachment cannot mutate the pending send')
  await act(async()=>{await renderer.root.findByType('textarea').props.onPaste({clipboardData:{items:[{kind:'file',getAsFile:()=>imageFile}]},preventDefault:()=>{prevented=true}})})
  assert.equal(prevented,true)
  assert.equal(f.store.getSnapshot().acpAttachments[0].sha256,attachment.sha256,'pasted images use the same frozen byte path')
  await act(async()=>{renderer.unmount();renderer=TestRenderer.create(React.createElement(f.App))})
  assert.equal(f.calls.filter(call=>call.input.action==='prompt').length,1)
  assert.ok(JSON.stringify(renderer.toJSON()).includes(attachment.sha256))
  await act(async()=>renderer.unmount())
})

test('unknown sends in separate native sessions keep separate operation identities',async()=>{
  const a=base(),b={...base(),id:'record-2',sessionId:'native-2'}
  const f=harness(async(_owner,input)=>{
    if(input.action==='defaults')return {protocol:2,transport:'acp'}
    if(input.action==='status'&&!input.id)return {protocol:2,sessions:[a,b]}
    if(input.action==='prompt')throw new Error('unknown')
    return input.id===b.id?b:a
  })
  f.store.actions.set('acpSelectedId',a.id)
  let renderer
  await act(async()=>{renderer=TestRenderer.create(React.createElement(f.App))})
  await act(async()=>{renderer.root.findByType('textarea').props.onChange({target:{value:'first'}})})
  await act(async()=>{await findButton(renderer,'Send').props.onClick()})
  const first=f.store.getSnapshot().acpOperations[a.id]
  await act(async()=>{renderer.root.findAllByType('select').find(node=>node.props['aria-label']==='Sessions').props.onChange({target:{value:b.id}})})
  await act(async()=>{renderer.root.findByType('textarea').props.onChange({target:{value:'second'}})})
  await act(async()=>{await findButton(renderer,'Send').props.onClick()})
  const operations=f.store.getSnapshot().acpOperations
  assert.equal(operations[a.id].operationId,first.operationId)
  assert.notEqual(operations[b.id].operationId,first.operationId)
  assert.equal(f.calls.filter(call=>call.input.action==='prompt').length,2)
  await act(async()=>renderer.unmount())
})

test('login errors clear the password field and failed cleanup retains cancellation',async()=>{
  let login={status:'awaiting-input',url:'https://accounts.google.com/o/oauth2/auth?state=test',cleanupConfirmed:false}
  const f=harness(async(_owner,input)=>{
    if(input.action==='defaults')return {protocol:2,transport:'acp'}
    if(input.action==='login-submit')throw new Error('raw server message contains PRIVATE_CODE')
    if(input.action==='login-cancel')login={status:'cancelled',cleanupConfirmed:true}
    return {protocol:2,sessions:[],login}
  })
  let renderer
  await act(async()=>{renderer=TestRenderer.create(React.createElement(f.App))})
  await act(async()=>{renderer.root.findByType('input').props.onChange({target:{value:'PRIVATE_CODE'}})})
  await act(async()=>{await findButton(renderer,'Submit official sign-in code').props.onClick()})
  assert.equal(renderer.root.findByType('input').props.value,'')
  assert.equal(JSON.stringify(renderer.toJSON()).includes('PRIVATE_CODE'),false)
  assert.equal(JSON.stringify(f.store.getSnapshot()).includes('PRIVATE_CODE'),false)
  login={status:'failed',cleanupConfirmed:false}
  await act(async()=>{await f.timers.poll()})
  assert.ok(findButton(renderer,'Cancel sign-in'))
  assert.equal(findButton(renderer,'Sign in with Google').props.disabled,true)
  await act(async()=>{await findButton(renderer,'Cancel sign-in').props.onClick()})
  assert.equal(findButton(renderer,'Sign in with Google').props.disabled,false)
  await act(async()=>renderer.unmount())
})

test('oversize text is rejected before recording an operation and pre-dispatch INVALID_REQUEST clears operation lock',async()=>{
  const snapshot=base()
  let shouldRejectInvalid=true
  const f=harness(async(_owner,input)=>{
    if(input.action==='defaults')return {protocol:2,transport:'acp'}
    if(input.action==='status'&&!input.id)return {protocol:2,sessions:[snapshot]}
    if(input.action==='prompt'){
      if(shouldRejectInvalid){const err=new Error('Wait for the outstanding native work');err.code='INVALID_REQUEST';throw err}
      return {...snapshot,revision:2,prompt:{operationId:input.operationId,state:'pending'}}
    }
    return snapshot
  })
  f.store.actions.set('acpSelectedId',snapshot.id)
  let renderer
  await act(async()=>{renderer=TestRenderer.create(React.createElement(f.App))})
  await act(async()=>{renderer.root.findByType('textarea').props.onChange({target:{value:'a'.repeat(1024*1024+1)}})})
  await act(async()=>{await findButton(renderer,'Send').props.onClick()})
  assert.equal(f.calls.filter(call=>call.input.action==='prompt').length,0,'oversize text must never dispatch or lock the session')
  assert.equal(Object.keys(f.store.getSnapshot().acpOperations).length,0)
  assert.equal(findButton(renderer,'Send').props.disabled,false)

  await act(async()=>{renderer.root.findByType('textarea').props.onChange({target:{value:'valid prompt'}})})
  await act(async()=>{await findButton(renderer,'Send').props.onClick()})
  assert.equal(f.calls.filter(call=>call.input.action==='prompt').length,1)
  assert.equal(Object.keys(f.store.getSnapshot().acpOperations).length,0,'confirmed pre-dispatch INVALID_REQUEST must not leave Send permanently disabled')
  assert.equal(findButton(renderer,'Send').props.disabled,false)

  shouldRejectInvalid=false
  await act(async()=>{await findButton(renderer,'Send').props.onClick()})
  assert.equal(f.calls.filter(call=>call.input.action==='prompt').length,2)
  assert.equal(f.store.getSnapshot().acpDraft,'')
  await act(async()=>renderer.unmount())
})
