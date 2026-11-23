import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import * as GatewayClient from '@deepseek-ai/dsh-api-gateway/client'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { installAcpHost, acpOwnerContext } from '../lib/acp/host.js'
import { validateAcpAction } from '../lib/acp/remote.js'
import { resolveConfig, apply } from '../lib/index.js'

test('ACP is the default; only explicit headless configuration permits legacy delegation',()=>{
  assert.equal(resolveConfig().transport,'acp')
  assert.equal(resolveConfig({transport:'headless'}).transport,'headless')
  assert.throws(()=>resolveConfig({transport:'proxy'}),/transport/)
  assert.throws(()=>resolveConfig({env:{KEY:'forbidden'}}),/unsupported fields/)
})

test('Remote rejects caller authority overrides and malformed sensitive actions',()=>{
  for(const patch of [{owner:'other'},{context:{owner:'other'}},{cwd:'/other'},{workspace:'/other'},{env:{}},{command:'proxy'},{systemPrompt:'replace'}]){
    assert.throws(()=>validateAcpAction({version:2,action:'connect',...patch}),/Invalid/)
  }
  for(const input of [{version:1,action:'start'}, {version:2,action:'prompt',id:'s1',operationId:'bad',prompt:[]}, {version:2,action:'login-submit',input:'first\nsecond'}])assert.throws(()=>validateAcpAction(input))
})

test('physical workspace and live binding are derived exclusively from the server Agent',async t=>{
  const dir=await realpath(await mkdtemp(join(tmpdir(),'acp-host-context-')))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  await symlink(dir,join(dir,'alias'),'dir')
  const agent={id:'agent',session:{id:'owner'}},registry=new Map([['agent',agent]])
  const ctx={workingDirectory:{get:()=>join(dir,'alias')},get:()=>registry}
  assert.deepEqual(await acpOwnerContext(ctx,agent),{owner:'owner',workspace:dir})
  registry.delete('agent')
  await assert.rejects(acpOwnerContext(ctx,agent),/binding/)
})

test('real Typert Client and Host authenticate ACP actions without appending command or login events',async t=>{
  const ctx=new Context();t.after(()=>ctx.fiber.dispose())
  await ctx.plugin(TypertRegistry)
  ctx.provide('remoteAccess',{decide:()=>({kind:'deny',reason:'fixture-deny'})})
  await ctx.plugin(Gateway);await ctx.plugin(SessionStore);await ctx.plugin(SessionProjectionRegistry);await ctx.plugin(AgentRegistry)
  const cwd=await realpath(process.cwd()),session=ctx.sessions.create('owner',{meta:{cwd}})
  const agent={id:session.id,session,ctx,status:'idle',options:{},whenIdle:()=>Promise.resolve()}
  await ctx.agents.register(agent)
  ctx.provide('workingDirectory',{get:()=>cwd})
  const calls=[],stopped=[];let transport='acp',disposed=0,active=false
  const manager={action:async(context,input)=>{calls.push({context,input});return {protocol:2,...(input.action==='defaults'?{transport}:{}),sessions:[]}},dispose:async()=>{disposed++},isActive:owner=>active&&owner==='owner',stopOwner:async owner=>{stopped.push(owner);active=false}}
  const service=installAcpHost(ctx,()=>({transport}),{manager})
  assert.equal(installAcpHost(ctx,()=>({transport}),{manager}).name,'antigravityAcp')
  ctx.on('workspace/session-activity',async(_request,next)=>[{kind:'job',items:[{id:'job-1'}]},...await next()])
  active=true
  assert.deepEqual(await ctx.waterfall('workspace/session-activity',{sessionId:'owner'},async()=>[]),[
    {kind:'antigravity-acp',items:[{id:'owner',label:'Antigravity ACP'}]},
    {kind:'job',items:[{id:'job-1'}]},
  ])
  await ctx.parallel('workspace/session-stop',{sessionId:'owner'})
  assert.deepEqual(stopped,['owner'])
  assert.deepEqual(await ctx.waterfall('workspace/session-activity',{sessionId:'owner'},async()=>[]),[{kind:'job',items:[{id:'job-1'}]}])
  const archives={archivedSessionIds:['owner']}
  ctx.provide('workspaceRegistry',archives)
  await assert.rejects(service.action(agent,{version:2,action:'connect'}),/archived/)
  await assert.rejects(service.action(agent,{version:2,action:'login-start'}),/archived/)
  await service.action(agent,{version:2,action:'status'})
  archives.archivedSessionIds=[]
  const before=session.snapshotEvents()
  const clientCtx=new Context();t.after(()=>clientCtx.fiber.dispose())
  await clientCtx.plugin(TypertRegistry)
  const peer={id:'test',ctx,principal:{kind:'owner'},signal:new AbortController().signal,dispose:async()=>{}}
  clientCtx.provide('connection',{rpc:{call:async(route,endpoint,payload,signal)=>{
    assert.equal(route,'/api');assert.equal(endpoint,'antigravityAcp/action')
    return {ok:true,value:await ctx.typertGateway.invoke({namespace:'antigravityAcp',method:'action',args:JSON.parse(JSON.stringify(payload.args)),peer:{...peer,signal}})}
  },open:async function*(){}},start:()=>({stop(){}}),registerGenerationSource:()=>()=>{}})
  await clientCtx.plugin(GatewayClient)
  let definition
  clientCtx.provide('slots',{inject:(_name,fn)=>fn(),register:value=>{definition=value;return()=>{}}})
  const factory=vm.runInNewContext(readFileSync(new URL('../assets/acp-client.js',import.meta.url),'utf8')+'\ncreateAntigravityAcpClient',{navigator:{language:'en'},URL})(()=>React)
  await clientCtx.plugin(factory)
  const binding=definition.inject('owner',{})
  for(const input of [{version:2,action:'defaults'},{version:2,action:'connect'},{version:2,action:'login-submit',input:'private-code'}])await binding.execute(input)
  assert.deepEqual(calls.at(-1),{context:{owner:'owner',workspace:cwd},input:{version:2,action:'login-submit',input:'private-code'}})
  assert.deepEqual(session.snapshotEvents(),before,'the authenticated carrier does not copy code or prompts into command events')
  await assert.rejects(ctx.typertGateway.invoke({namespace:'antigravityAcp',method:'action',args:{agentId:'missing',input:{version:2,action:'list'}},peer}))
  await assert.rejects(ctx.typertGateway.invoke({namespace:'antigravityAcp',method:'action',args:{agentId:'owner',input:{version:2,action:'connect'}},peer:{...peer,principal:{kind:'capability',tokenId:'untrusted'}}}),/access denied/)
  const count=calls.length
  await assert.rejects(binding.execute({version:2,action:'connect',owner:'forged'}),/Invalid/)
  assert.equal(calls.length,count)
  transport='headless'
  assert.equal((await binding.execute({version:2,action:'defaults'})).transport,'headless')
  await assert.rejects(service.action(agent,{version:2,action:'connect'}),/requires transport/)
  const commands=new Map(),events=new Map(),tools=[]
  apply({inject(){},commands:{register:value=>commands.set(value.name,value)},workingDirectory:{get:()=>cwd},on:(name,fn)=>events.set(name,fn),get:name=>name==='antigravityAcp'?service:undefined},{})
  events.get('agent/created')({agent:{...agent,ctx:{tools:{register:value=>tools.push(value)}}}})
  assert.equal(tools.length,0)
  const command=commands.get('antigravity')
  assert.equal((await command.handler({agent,rawInput:JSON.stringify({version:1,action:'start',prompt:'never-dispatched'})})).kind,'error')
  assert.equal((await command.handler({agent,rawInput:JSON.stringify({version:2,action:'login-submit',input:'never-dispatched'})})).kind,'error')
  assert.equal((await command.handler({agent,rawInput:''})).kind,'success')
  assert.equal(command.recordInput,false)
  assert.equal((await command.handler({agent,rawInput:'PRIVATE_CODE'})).text.includes('PRIVATE_CODE'),false)
  transport='acp'
  await ctx.plugin(CommandRuntime)
  apply(ctx,{})
  for(const line of ['/antigravity PRIVATE_CODE','/antigravity {"version":2,"action":"login-submit","input":"PRIVATE_CODE"}']){
    const result=await ctx.commands.execute(agent,line,[],new AbortController().signal)
    assert.equal(result.result.kind,'error')
  }
  assert.equal(JSON.stringify(session.snapshotEvents()).includes('PRIVATE_CODE'),false,'rejected pasted credentials do not reach command input or output events')
  assert.equal(disposed,0)
  await clientCtx.fiber.dispose()
  await assert.rejects(binding.execute({version:2,action:'defaults'}),/binding has ended/)
  await ctx.fiber.dispose()
  assert.equal(disposed,1)
})

test('a previously registered headless tool loses authority as soon as transport changes',async()=>{
  const config={transport:'headless',presets:['daily']},events=new Map(),tools=[]
  const agent={id:'owner',session:{id:'owner',header:{agentPreset:'daily'}},ctx:{tools:{register:tool=>tools.push(tool)}}}
  apply({inject(){},commands:{register(){}},workingDirectory:{get:()=>process.cwd()},on:(event,fn)=>events.set(event,fn)},config)
  events.get('agent/created')({agent})
  assert.equal(tools.length,1)
  config.transport='acp'
  await assert.rejects(tools[0].execute({prompt:'must never dispatch'},{}),/not enabled/)
  events.get('agent/created')({agent})
  assert.equal(tools.length,1,'the ACP path never registers another agent tool')
  await events.get('dispose')()
})
