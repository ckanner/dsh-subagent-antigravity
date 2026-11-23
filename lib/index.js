import { Config, resolveConfig } from './config.js'
import { DesktopTasks } from './desktop.js'
import { installAcpHost } from './acp/host.js'
export { Config, resolveConfig }
export const name='antigravity'
export const inject=['commands','workingDirectory']
const toolOutput={oneOf:[{type:'object',properties:{content:{type:'array',items:{type:'object',properties:{type:{type:'string',const:'text'},text:{type:'string'}},required:['type','text'],additionalProperties:false}}},required:['content'],additionalProperties:false},{type:'object',properties:{kind:{type:'string',const:'background'},jobId:{type:'string'}},required:['kind','jobId'],additionalProperties:false}]}
const summary=result=>JSON.stringify({invocationId:result.invocationId,status:result.status,session:result.session,output:result.output,failure:result.failure,cleanup:result.cleanup,providerWork:result.providerWork,native:result.native})
const nativeSchema={type:'object',additionalProperties:false,properties:{version:{type:'integer',const:1},mode:{type:'string',enum:['native','subagents','swarm']},maxObservedAgents:{type:'integer',enum:[1,2,3,4,5,6,7,8],description:'Stop when the observed total of unique child IDs exceeds this value, including verifier and monitor. Not a hard native concurrency limit.'}},required:['version','mode']}
const acpCommandSummary=value=>{
  const result={protocol:2}
  for(const key of ['id','transport','sourceCwd','cwd','branch','baseCommit','revision','status','connection','createdAt','updatedAt'])if(['string','number','boolean'].includes(typeof value[key]))result[key]=value[key]
  for(const [key,fields] of [['runtime',['executable','version','sha256','platform','architecture']],['knownWork',['tools','permissions','children','unknown']],['cleanup',['process','session']]])if(value[key])result[key]=Object.fromEntries(fields.filter(field=>['string','number','boolean'].includes(typeof value[key][field])).map(field=>[field,value[key][field]]))
  if(Array.isArray(value.sessions))result.sessions=value.sessions.map(acpCommandSummary)
  result.view='Open the Antigravity tab for prompts, permissions, sign-in and full session details.'
  return result
}

export function apply(ctx,rawConfig={}) {
  resolveConfig(rawConfig)
  if(typeof ctx.commands?.register!=='function'||typeof ctx.workingDirectory?.get!=='function'||typeof ctx.on!=='function')throw new Error('Antigravity requires DSH commands, workingDirectory and Agent lifecycle services')
  let tasks,acpHost
  const getTasks=()=>tasks??=new DesktopTasks({getConfig:()=>resolveConfig(rawConfig)})
  const jobs=ctx.get?.('jobs')
  // The public Typert service is independent of logged slash commands. It also
  // exposes the selected transport so the desktop can retain explicit headless UI.
  if(typeof ctx.inject==='function')ctx.inject(['typert'],scope=>{acpHost=installAcpHost(scope,()=>rawConfig)})
  else if(resolveConfig(rawConfig).transport==='acp')acpHost=installAcpHost(ctx,()=>rawConfig)
  const owner=agent=>({owner:String(agent.session.id??agent.id),workspace:ctx.workingDirectory.get(agent.session)??agent.session.header?.cwd})
  const allowed=agent=>{
    if(resolveConfig(rawConfig).transport!=='headless')return false
    const registry=ctx.get?.('agentPresets')
    let preset
    try{preset=registry?.composedPreset?.(agent.ctx)??agent.session.header?.agentPreset}catch{return false}
    return resolveConfig(rawConfig).presets.includes(preset)
  }
  const serve=agent=>{
    if(!agent||!allowed(agent)||typeof agent.ctx?.tools?.register!=='function')return
    agent.ctx.tools.register({name:'subagent_antigravity',description:'Delegate a complete text task to the official Antigravity CLI using its native subscription. Choose native behavior, explicit subagents, or Swarm with native.version 1. An Orchestrator model uses empty effort; adjustable model slug and effort must match. Native collaboration completion covers the CLI invocation; child states and aggregate usage can remain unknown. Read the receipt; unknown results must not be replayed. Background jobs use job_output and job_kill. An exact sessionId resumes only a confirmed matching conversation.',
      parameters:{type:'object',additionalProperties:false,properties:{prompt:{type:'string'},label:{type:'string'},model:{type:'string'},effort:{type:'string',enum:['','low','medium','high','xhigh']},native:nativeSchema,sessionId:{type:'string'},toolPolicy:{type:'string',enum:['native','evidence-only']},timeoutMs:{type:'integer',description:'Total deadline in milliseconds; 0 is unlimited.'},outputSchema:{type:'object'},run_in_background:{type:'boolean'}},required:['prompt']},
      output:{schema:toolOutput,render:(_args,value)=>value.content??[{type:'text',text:'Antigravity background job '+value.jobId}]},
      async execute(args,execution){
        if(!allowed(agent))throw new Error('Antigravity is not enabled for the current committed preset')
        const {run_in_background,...call}=args
        const context=owner(agent)
        const run=async(signal,onProgress)=>{const active=getTasks();const started=await active.action(context,{version:1,action:'start',...call},{direct:false,signal,onProgress});return summary(await active.wait(context,started.invocationId))}
        if(run_in_background){
          if(!jobs?.start)throw new Error('Background Antigravity delegation requires the DSH jobs service')
          const controller=new AbortController()
          const jobId=jobs.start({kind:'subagent',label:call.label??'Antigravity task',owner:String(agent.id),run:handle=>({cancel:()=>controller.abort(),done:run(controller.signal,t=>handle.append(t)).then(result=>({status:controller.signal.aborted?'killed':JSON.parse(result).status==='completed'?'completed':'failed',result}),error=>({status:'failed',result:error.message}))})})
          return {kind:'background',jobId}
        }
        return {content:[{type:'text',text:await run(execution?.signal)}]}
      }})
  }
  ctx.commands.register({name:'antigravity',description:'Open the Antigravity ACP view, inspect its runtime, or control an owned session. Prompts and sign-in stay in the authenticated view.',recordInput:false,input:{hint:'Open the Antigravity tab; optional version 2 action: doctor, connect, list, status, cancel'},async handler({rawInput,agent,signal}){
    try{
      const config=resolveConfig(rawConfig)
      if(!rawInput?.trim())return {kind:'success',text:JSON.stringify({protocol:2,transport:config.transport,message:config.transport==='acp'?'Open the Antigravity tab for official sign-in, an isolated worktree, prompts and permission requests.':'Explicit headless delegation is enabled. The Antigravity tab uses legacy task controls.'})}
      let input
      try{input=JSON.parse(rawInput)}catch{throw new Error('Enter a version 2 control action; send prompts and official sign-in responses in the Antigravity tab')}
      if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Enter an Antigravity control action object')
      if(input.version===1){
        if(config.transport!=='headless')throw new Error('Legacy version 1 actions require explicit transport: headless. Use the Antigravity ACP tab.')
        return {kind:'success',text:JSON.stringify(await getTasks().action(owner(agent),input,{direct:true,signal}))}
      }
      if(input.version!==2||!['doctor','connect','list','status','cancel'].includes(input.action))throw new Error('Use the Antigravity tab for prompts, configuration, permissions and official sign-in; these values must not be sent through commands')
      const host=acpHost??ctx.get?.('antigravityAcp')
      if(!host)throw new Error('The authenticated Antigravity ACP service is not ready in this DSH host')
      let result
      try{result=await host.action(agent,input,signal)}catch{throw new Error('The ACP control request was not confirmed. Open the Antigravity tab to inspect its diagnostic and original session; no prompt was replayed.')}
      return {kind:'success',text:JSON.stringify(acpCommandSummary(result))}
    }catch(error){return {kind:'error',text:error.message}}
  }})
  ctx.on('agent/created',({agent})=>serve(agent))
  ctx.on('agent-preset/selected',(sessionId)=>serve(ctx.get?.('agents')?.get?.(String(sessionId))))
  if(typeof ctx.effect==='function')ctx.effect(()=>()=>tasks?.dispose())
  else ctx.on('dispose',()=>tasks?.dispose())
}
