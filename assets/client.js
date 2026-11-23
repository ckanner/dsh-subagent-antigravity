// DSH's public lazy module: Plugin Manager settings form only.
window.__ModuleLoader__.load({id:'@ckanner/dsh-subagent-antigravity',factory:function(require){
  const exports={},React=require('react'),h=React.createElement
  const zh=typeof navigator!=='undefined'&&navigator.language?.startsWith('zh')
  const t=zh?{cwd:'工作目录（留空沿用会话）',model:'模型',effort:'思考等级',mode:'执行模式',permission:'工具审批',sandbox:'请求原生终端沙箱',settings:'Antigravity 默认配置',save:'保存',saved:'已保存，后续任务使用新默认值。',conflict:'保存冲突，草稿已保留。',hint:'任务直接调用官方 CLI；此面板不会调用父模型。',review:'需要审批的动作在无界面调用中会被拒绝',all:'预先批准全部工具动作',fixed:'固定（由模型决定）',collaboration:'原生协作模式',automatic:'保留原生行为',subagents:'请求原生子智能体',swarm:'请求 Swarm',limit:'已观察子成员总数上限（1–8，留空不限）',limitHint:'统计唯一子成员，包含 verifier 和 monitor；超出后停止本次调用。这不是原生并发硬上限。'}:{cwd:'Working directory (blank uses session)',model:'Model',effort:'Effort',mode:'Execution mode',permission:'Tool approval',sandbox:'Request native terminal sandbox',settings:'Antigravity defaults',save:'Save',saved:'Saved. Future tasks use the new defaults.',conflict:'Save conflict. Your draft is preserved.',hint:'Tasks use the official CLI directly; this panel does not invoke the parent model.',review:'Actions needing approval are denied in headless mode',all:'Preapprove all tool actions',fixed:'Fixed by model',collaboration:'Native collaboration',automatic:'Preserve native behavior',subagents:'Request native subagents',swarm:'Request Swarm',limit:'Observed child total limit (1–8, blank for none)',limitHint:'Counts unique children, including verifier and monitor; stops this invocation after an observed excess. This is not a hard native concurrency limit.'}
  const defaults={transport:'acp',command:'agy',model:'gemini-4-hydrogen-high',effort:'high',native:undefined,executionMode:'default',permissionMode:'request-review',sandbox:false,timeoutMs:600000,disposeGraceMs:2000,presets:['daily','heavy','cordis']}
  const orchestrators=['gemini-pro-orchestrator-neon','gemini-pro-orchestrator','gemini-pro-orchestrator-argon']
  const fixed=model=>orchestrators.includes(model),effortOf=model=>fixed(model)?'':/-(low|medium|high|xhigh)$/.exec(model)?.[1]
  const field=(label,element)=>h('label',{style:{display:'grid',gap:4}},label,element)
  const input=(label,value,onChange,type='text')=>field(label,h('input',{type,value,onChange:e=>onChange(type==='number'?Number(e.target.value):e.target.value)}))
  const select=(label,value,choices,onChange,disabled=false)=>field(label,h('select',{value,disabled,onChange:e=>onChange(e.target.value)},choices.map(option=>h('option',{key:typeof option==='string'?option:option[0],value:typeof option==='string'?option:option[0]},typeof option==='string'?option:option[1]))))
  const effortField=(model,effort,onChange)=>select(t.effort,fixed(model)?'':effort,fixed(model)?[['',t.fixed]]:/carbon|argon/.test(model)?['low','medium','high']:['low','medium','high','xhigh'],onChange,fixed(model))
  function nativeFields(value,setValue){
    const mode=value?.mode??'native'
    return h(React.Fragment,null,select(t.collaboration,mode,[['native',t.automatic],['subagents',t.subagents],['swarm',t.swarm]],v=>setValue({...value,version:1,mode:v})),
      field(t.limit,h('input',{type:'number',min:1,max:8,step:1,value:value?.maxObservedAgents??'',onChange:e=>{const next={...value,version:1,mode};if(e.target.value==='')delete next.maxObservedAgents;else next.maxObservedAgents=Number(e.target.value);setValue(next)}})))
  }
  function Settings({view,form}){
    const state=form?.state,[draft,setDraft]=React.useState({...defaults,...state?.value}),[dirty,setDirty]=React.useState(false),[revision,setRevision]=React.useState(state?.revision),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('')
    React.useEffect(()=>{if(!dirty&&!busy){setDraft({...defaults,...state?.value});setRevision(state?.revision)}},[state?.revision,dirty,busy])
    const set=(key,value)=>{if(!dirty)setRevision(state?.revision);setDraft(previous=>({...previous,[key]:value}));setDirty(true)}
    const enabled=state?.status==='ready'&&state.writable===true&&!busy
    const save=async()=>{setBusy(true);try{const value={...draft};if(!value.defaultCwd)delete value.defaultCwd;const operations=Object.keys(defaults).concat(['defaultCwd']).map(key=>value[key]===undefined?{op:'unset',path:[key]}:{op:'set',path:[key],value:value[key]});const accepted=await form.mutate(operations,revision);setMessage(accepted?t.saved:t.conflict);if(accepted)setDirty(false)}catch(error){setMessage(error.message)}finally{setBusy(false)}}
    if(view==='summary')return h('span',null,t.settings)
    return h('section',{style:{display:'grid',gap:10,maxWidth:800}},h('h3',null,t.settings),h('p',null,draft.transport==='headless'?t.hint:(zh?'通过官方 CLI ACP 运行 Antigravity 后端；模型与会话控制由 Flywheel 或调用方管理。':'Runs official CLI ACP backend; model and session orchestration are owned by Flywheel or the caller.')),select(zh?'连接方式':'Transport',draft.transport,[['acp','ACP'],['headless',zh?'显式无界面委派':'Explicit headless delegation']],v=>set('transport',v)),input('agy command',draft.command,v=>set('command',v)),draft.transport==='headless'?h(React.Fragment,null,input(t.cwd,draft.defaultCwd??'',v=>set('defaultCwd',v)),input(t.model,draft.model,v=>{set('model',v);const effort=effortOf(v);if(effort!==undefined)set('effort',effort)}),effortField(draft.model,draft.effort,v=>{set('effort',v);set('model',draft.model.replace(/-(low|medium|high|xhigh)$/,'-'+v))}),nativeFields(draft.native,v=>set('native',v)),h('small',null,t.limitHint),select(t.mode,draft.executionMode,['default','accept-edits','plan'],v=>set('executionMode',v)),select(t.permission,draft.permissionMode,[['request-review',t.review],['always-proceed',t.all]],v=>set('permissionMode',v)),h('label',null,h('input',{type:'checkbox',checked:draft.sandbox,onChange:e=>set('sandbox',e.target.checked)}),t.sandbox),input('Timeout (ms, 0 = unlimited)',draft.timeoutMs,v=>set('timeoutMs',v),'number'),input('Presets',draft.presets.join(', '),v=>set('presets',v.split(',').map(p=>p.trim()).filter(Boolean))),):null,h('button',{disabled:!enabled||!dirty,onClick:save},t.save),h('p',{role:'status'},message))
  }
  exports.inject=['slots']
  exports.apply=function(ctx){
    ctx.slots.inject('plugins.row.config',()=>ctx.slots.register({name:'plugins.row.config',key:'@ckanner/dsh-subagent-antigravity#antigravity'},Settings))
  }
  return exports
}})
