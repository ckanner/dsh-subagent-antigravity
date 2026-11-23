// Public, dependency-light source factory. Both desktop bundles embed this file.
function createAntigravityAcpClient(require) {
  const React = require('react'), h = React.createElement
  const zh = typeof navigator !== 'undefined' && navigator.language?.startsWith('zh')
  const t = zh ? {
    title:'Antigravity', hint:'使用官方 CLI 的登录与智能体。每个新会话使用当前已提交 HEAD 创建独立 Git worktree；未提交修改不会自动复制。切换视图只断开界面订阅。',
    new:'新建独立会话', refresh:'刷新', doctor:'检查 CLI', login:'官方 Google 登录', loginSubmit:'提交官方登录码', loginCancel:'取消登录', loginCode:'官方网页显示的登录码或回调 URL', loginDone:'登录进程已成功退出。请连接或恢复会话以验证登录状态。', loginFailed:'无法提交登录响应。请检查官方登录流程；输入已清除，不会自动重试。', openLogin:'打开官方登录网页',
    sessions:'会话', resume:'恢复会话', disconnect:'断开会话', stop:'停止工作', send:'发送', prompt:'给 Antigravity 的任务', source:'来源工作区', worktree:'独立工作目录', base:'创建时提交', branch:'分支', status:'会话状态', connection:'连接', root:'当前请求', known:'已报告工作', tools:'工具', permissions:'待授权', children:'原生成员', unknown:'未确认',
    permission:'Antigravity 请求授权', dismiss:'取消本次授权请求', config:'官方会话配置', unsupported:'此个人登录入口仅支持官方返回的 Gemini 模型', transcript:'对话', thought:'思考', user:'你', assistant:'Antigravity', plan:'计划', history:'显示的是截断后的本地记录，不代表完整原生历史。',
    detached:'根请求返回后，工具和原生后续工作仍可能继续。请以已报告状态判断。', uncertain:'发送结果尚未确认。保留原操作 ID 与附件字节，刷新会话核对；不会自动重发。', reconcile:'核对发送结果', empty:'先连接新的独立会话，或恢复一个已记录会话。', loading:'正在连接认证服务…', unavailable:'认证 ACP 服务不可用', noConfig:'官方 runtime 尚未返回可选择配置。', clean:'进程 / 会话清理', retained:'断开连接会保留 worktree 和记录。', transport:'当前入口',
    images:'添加图片', imageHint:'可选择或粘贴 PNG、JPEG、WebP、GIF；每张不超过 8 MiB。', imageInvalid:'图片须为 PNG、JPEG、WebP 或 GIF，每张大于 0 且不超过 8 MiB。', imageReading:'正在读取图片…', imageUnsupported:'此 runtime 未声明支持图片输入。', imageRemove:'移除', promptLimit:'一次发送最多 16 个内容块，总大小不得超过 16 MiB。', textLimit:'单段文本不得超过 1 MiB。',
  } : {
    title:'Antigravity', hint:'Uses the official CLI sign-in and agent. Each new session gets an isolated Git worktree from the current committed HEAD; uncommitted edits are not copied automatically. Switching views only detaches the UI.',
    new:'New isolated session', refresh:'Refresh', doctor:'Check CLI', login:'Sign in with Google', loginSubmit:'Submit official sign-in code', loginCancel:'Cancel sign-in', loginCode:'Code or callback URL from the official page', loginDone:'The login process exited successfully. Connect or resume a session to verify sign-in.', loginFailed:'Could not submit sign-in. Check the official flow; the input was cleared and will not be retried automatically.', openLogin:'Open official sign-in page',
    sessions:'Sessions', resume:'Resume session', disconnect:'Disconnect session', stop:'Stop work', send:'Send', prompt:'Task for Antigravity', source:'Source workspace', worktree:'Isolated working directory', base:'Starting commit', branch:'Branch', status:'Session state', connection:'Connection', root:'Current request', known:'Reported work', tools:'Tools', permissions:'Pending permissions', children:'Native members', unknown:'Unconfirmed',
    permission:'Antigravity requests permission', dismiss:'Cancel this permission request', config:'Official session configuration', unsupported:'This personal sign-in entry supports only Gemini models returned by the official runtime', transcript:'Conversation', thought:'Thought', user:'You', assistant:'Antigravity', plan:'Plan', history:'This local record is truncated and is not the complete native conversation history.',
    detached:'Tools and native follow-up work may continue after the root request returns. Follow the reported state.', uncertain:'The send outcome is unconfirmed. Its operation ID and attachment bytes are retained for reconciliation; no automatic replay will occur.', reconcile:'Check send outcome', empty:'Connect a new isolated session or resume a recorded session.', loading:'Connecting to the authenticated service…', unavailable:'Authenticated ACP service unavailable', noConfig:'The official runtime has not returned selectable configuration yet.', clean:'Process / session cleanup', retained:'Disconnecting preserves the worktree and session record.', transport:'Current transport',
    images:'Add images', imageHint:'Choose or paste PNG, JPEG, WebP or GIF images, up to 8 MiB each.', imageInvalid:'Use PNG, JPEG, WebP or GIF images larger than 0 bytes and no more than 8 MiB each.', imageReading:'Reading images…', imageUnsupported:'This runtime has not advertised image input.', imageRemove:'Remove', promptLimit:'A send supports at most 16 content blocks and 16 MiB total.', textLimit:'Prompt text must not exceed 1 MiB.',
  }
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const allowed = {
    defaults:[],doctor:[],list:[],status:['id'],connect:[],resume:['id'],prompt:['id','operationId','prompt'],cancel:['id'],
    permission:['id','requestId','optionId'],configure:['id','configId','value'],disconnect:['id'],'login-start':[],'login-submit':['input'],'login-cancel':[],
  }
  function parseInput(value) {
    if (!record(value) || value.version !== 2 || !Object.hasOwn(allowed,value.action) ||
        Object.keys(value).some(key=>!['version','action',...allowed[value.action]].includes(key))) throw new Error('Invalid ACP action')
    return value
  }
  function parseResult(value) {
    if (!record(value) || value.protocol !== 2) throw new Error('Invalid ACP response')
    return value
  }
  const codec = (name,parse) => ({mode:'strict',typeSymbol:'@ckanner/dsh-subagent-antigravity#'+name,create:()=>({parse})})
  const sessionId = value => {
    if(typeof value!=='string'||!value||value.length>512||/[\u0000-\u001f]/.test(value))throw new Error('Invalid DSH conversation')
    return value
  }
  const styles = {root:{display:'grid',gap:12,padding:16,maxWidth:1100,margin:'0 auto',overflowWrap:'anywhere'},row:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'},box:{border:'1px solid var(--border-color, #8885)',borderRadius:6,padding:12},pre:{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:420,overflow:'auto'},label:{display:'grid',gap:4}}
  const button = (label,fn,disabled=false,key=label) => h('button',{key,type:'button',onClick:fn,disabled},label)
  const field = (label,node) => h('label',{style:styles.label},label,node)
  const errorText = error => typeof error?.message==='string'?error.message:String(error)
  const gemini = value => typeof value==='string'&&/^gemini(?:[-./]|$)/i.test(value)
  const imageTypes = ['image/png','image/jpeg','image/webp','image/gif']
  async function readImage(file) {
    if(!imageTypes.includes(file.type)||!Number.isFinite(file.size)||file.size<=0||file.size>8*1024*1024)throw new Error(t.imageInvalid)
    const bytes=new Uint8Array(await file.arrayBuffer())
    if(bytes.byteLength!==file.size)throw new Error(t.imageInvalid)
    let binary=''
    for(let start=0;start<bytes.length;start+=32768)binary+=String.fromCharCode(...bytes.subarray(start,start+32768))
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))
    return {id:crypto.randomUUID(),name:file.name||'Pasted image',mimeType:file.type,size:bytes.length,data:btoa(binary),sha256:[...hash].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
  }
  function createStore(initialState={}) {
    const init=()=>({...initialState,acpSelectedId:'',acpDraft:'',acpOperations:{},acpAttachments:[]})
    return {spec:{init,actions:{set:(draft,key,value)=>{draft[key]=value}}},create:()=>{
      let value=init();const listeners=new Set()
      return {getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},clearPersisted:()=>{},actions:{set:(key,next)=>{value={...value,[key]:next};for(const fn of listeners)fn()}}}
    }}
  }
  function safeAuthUrl(value) {
    try { const url=new URL(value);return url.origin==='https://accounts.google.com'&&!url.username&&!url.password?url.href:null } catch { return null }
  }
  function Content({blocks}) {
    return h(React.Fragment,null,...(blocks??[]).map((block,index)=>{
      if(block?.type==='text')return h('pre',{key:index,style:styles.pre},block.text)
      if(block?.type==='image'&&/^image\/(png|jpeg|webp|gif|bmp)$/.test(block.mimeType??'')&&typeof block.data==='string')return h('img',{key:index,alt:'Antigravity image',src:'data:'+block.mimeType+';base64,'+block.data,style:{maxWidth:'100%',maxHeight:500}})
      if(block?.type==='audio'&&/^audio\/[a-z0-9.+-]+$/i.test(block.mimeType??'')&&typeof block.data==='string')return h('audio',{key:index,controls:true,src:'data:'+block.mimeType+';base64,'+block.data})
      if(block?.type==='resource')return h('details',{key:index},h('summary',null,block.resource?.uri??'Resource'),h('pre',{style:styles.pre},block.resource?.text??'[binary resource]'))
      if(block?.type==='resource_link')return h('p',{key:index},block.name??'Resource',' ',h('code',null,block.uri))
      return h('pre',{key:index,style:styles.pre},JSON.stringify(block,null,2))
    }))
  }
  function ToolContent({items}) {
    return h(React.Fragment,null,...(items??[]).map((item,index)=>item?.type==='content'?h(Content,{key:index,blocks:[item.content]}):
      item?.type==='diff'?h('details',{key:index},h('summary',null,item.path),h('pre',{style:styles.pre},'---\n'+(item.oldText??'')+'\n+++\n'+item.newText)):
      h('p',{key:index},item?.type==='terminal'?'Terminal: '+item.terminalId:JSON.stringify(item))))
  }
  function Configuration({snapshot,run,busy}) {
    const options=snapshot?.configOptions??[]
    return h('section',{style:styles.box},h('h3',null,t.config),options.length?options.map(option=>{
      if(option.type==='boolean')return h('div',{key:option.id},field(option.name,h('input',{type:'checkbox',checked:option.currentValue===true,disabled:busy||snapshot.connection!=='connected',onChange:event=>run('configure',{id:snapshot.id,configId:option.id,value:event.target.checked})})))
      if(option.type!=='select')return null
      const values=(option.options??[]).flatMap(value=>Array.isArray(value.options)?value.options:[value])
      const isModel=option.category==='model'||option.id==='model'
      return h('div',{key:option.id},field(option.name,h('select',{'aria-label':option.name,value:option.currentValue,disabled:busy||snapshot.connection!=='connected',onChange:event=>run('configure',{id:snapshot.id,configId:option.id,value:event.target.value})},
        values.map(value=>h('option',{key:value.value,value:value.value,disabled:isModel&&!gemini(value.value)},value.name+(isModel&&!gemini(value.value)?' — '+t.unsupported:''))))),
        isModel&&!gemini(option.currentValue)?h('p',{role:'alert'},t.unsupported):null)
    }):h('p',null,t.noConfig),snapshot?.modes&&!options.some(value=>value.category==='mode'||value.id==='mode')?
      field('Mode',h('select',{'aria-label':'Mode',value:snapshot.modes.currentModeId,disabled:busy||snapshot.connection!=='connected',onChange:event=>run('configure',{id:snapshot.id,configId:'mode',value:event.target.value})},
        (snapshot.modes.availableModes??[]).map(mode=>h('option',{key:mode.id,value:mode.id},mode.name)))):null)
  }
  function View({useStore,actions,execute,legacyExecute,legacyView:LegacyView}) {
    const draft=useStore(value=>value),[transport,setTransport]=React.useState(null),[sessions,setSessions]=React.useState([]),[records,setRecords]=React.useState({}),[login,setLogin]=React.useState(null),[loginCode,setLoginCode]=React.useState(''),[diagnostic,setDiagnostic]=React.useState(null),[message,setMessage]=React.useState(''),[busy,setBusy]=React.useState(''),[attaching,setAttaching]=React.useState(false)
    const active=React.useRef(execute),selectedRef=React.useRef(draft.acpSelectedId),operationRef=React.useRef(draft.acpOperations),attachmentRef=React.useRef(draft.acpAttachments),attachmentBusy=React.useRef(false),flights=React.useRef(new Set())
    active.current=execute;selectedRef.current=draft.acpSelectedId;operationRef.current=draft.acpOperations??{};attachmentRef.current=draft.acpAttachments??[]
    const selected=draft.acpSelectedId,snapshot=records[selected],uncertain=draft.acpOperations?.[selected],attachments=draft.acpAttachments??[],imageEnabled=snapshot?.capabilities?.promptCapabilities?.image===true
    const apply=React.useCallback(value=>{
      if(Array.isArray(value.sessions))setSessions(value.sessions)
      if(value.login)setLogin(value.login)
      if(value.id){
        setRecords(previous=>{
          const old=previous[value.id]
          if(old&&Number.isFinite(old.revision)&&Number.isFinite(value.revision)&&old.revision>value.revision)return previous
          return {...previous,[value.id]:value}
        })
        setSessions(previous=>[value,...previous.filter(item=>item.id!==value.id)])
        const operation=operationRef.current[value.id]
        if(operation?.id===value.id&&value.prompt?.operationId===operation.operationId){
          const next={...operationRef.current};delete next[value.id];operationRef.current=next;actions.set('acpOperations',next)
          if(operation.text===draft.acpDraft)actions.set('acpDraft','')
          const sent=new Set((operation.attachments??[]).map(item=>item.id))
          const retained=attachmentRef.current.filter(item=>!sent.has(item.id));attachmentRef.current=retained;actions.set('acpAttachments',retained)
        }
      }
    },[actions,draft.acpDraft])
    const applyRef=React.useRef(apply);applyRef.current=apply
    React.useEffect(()=>{
      let live=true,inFlight=false,timer
      setTransport(null);setSessions([]);setRecords({});setLogin(null);setLoginCode('');setMessage('');setBusy('');setAttaching(false);attachmentBusy.current=false;flights.current.clear()
      const poll=async()=>{
        if(!live||inFlight)return
        inFlight=true
        try{
          const catalog=await execute({version:2,action:'status'})
          if(!live||active.current!==execute)return
          applyRef.current(catalog)
          const id=selectedRef.current
          if(id){
            const detail=await execute({version:2,action:'status',id})
            if(live&&active.current===execute)applyRef.current(detail)
          }
        }catch(error){if(live&&active.current===execute)setMessage(errorText(error))}finally{inFlight=false}
      }
      void execute({version:2,action:'defaults'}).then(async value=>{
        if(!live||active.current!==execute)return
        setTransport(value.transport)
        if(value.transport==='acp'){
          await poll()
          if(live)timer=setInterval(poll,1000)
        }
      }).catch(error=>{if(live&&active.current===execute)setMessage(errorText(error))})
      return()=>{live=false;clearInterval(timer);if(active.current===execute)active.current=null}
    },[execute])
    React.useEffect(()=>{
      if(!selected||transport!=='acp')return
      let live=true
      void execute({version:2,action:'status',id:selected}).then(value=>{if(live&&active.current===execute)applyRef.current(value)}).catch(error=>{if(live&&active.current===execute)setMessage(errorText(error))})
      return()=>{live=false}
    },[execute,selected,transport])
    const run=async(action,extra={})=>{
      if(flights.current.size&&!['cancel','login-cancel','permission'].includes(action))return
      const flight={action};flights.current.add(flight)
      setBusy(action);setMessage('')
      try{
        const value=await execute({version:2,action,...extra})
        if(active.current!==execute)return
        if(action==='doctor')setDiagnostic(value)
        else applyRef.current(value)
        if(action==='connect'&&value.id)actions.set('acpSelectedId',value.id)
        return value
      }catch(error){
        if(active.current===execute){
          if(action==='prompt'&&error?.code==='INVALID_REQUEST'&&extra.id&&operationRef.current[extra.id]?.operationId===extra.operationId){
            const next={...operationRef.current};delete next[extra.id];operationRef.current=next;actions.set('acpOperations',next)
            setMessage(errorText(error))
          }else setMessage(action==='login-submit'?t.loginFailed:errorText(error)+(action==='prompt'?' '+t.uncertain:''))
        }
      }finally{flights.current.delete(flight);if(active.current===execute)setBusy([...flights.current].at(-1)?.action??'')}
    }
    const addImages=async files=>{
      if(!imageEnabled||attachmentBusy.current||!files.length)return
      attachmentBusy.current=true;setAttaching(true);setMessage('')
      try{
        if(files.length+attachmentRef.current.length>15)throw new Error(t.promptLimit)
        const added=[]
        for(const file of files)added.push(await readImage(file))
        if(active.current!==execute||selectedRef.current!==selected)return
        const next=[...attachmentRef.current,...added]
        if(next.reduce((size,item)=>size+item.data.length+100,0)>16*1024*1024)throw new Error(t.promptLimit)
        attachmentRef.current=next;actions.set('acpAttachments',next)
      }catch(error){if(active.current===execute)setMessage(errorText(error))}finally{if(active.current===execute){attachmentBusy.current=false;setAttaching(false)}}
    }
    const send=()=>{
      if(!snapshot?.canPrompt||(!draft.acpDraft?.trim()&&!attachments.length)||operationRef.current[snapshot.id]||flights.current.size||attachmentBusy.current)return
      if(attachments.length&&!imageEnabled){setMessage(t.imageUnsupported);return}
      const text=draft.acpDraft??''
      if(text.trim()&&(text.length>1024*1024||new TextEncoder().encode(text).length>1024*1024)){setMessage(t.textLimit);return}
      const prompt=[...(text.trim()?[{type:'text',text}]:[]),...attachments.map(item=>({type:'image',mimeType:item.mimeType,data:item.data}))]
      if(prompt.length>16||new TextEncoder().encode(JSON.stringify(prompt)).length>16*1024*1024){setMessage(t.promptLimit);return}
      const operation={id:snapshot.id,operationId:crypto.randomUUID(),text:draft.acpDraft,prompt,attachments:attachments.map(({id,name,sha256,size})=>({id,name,sha256,size}))}
      operationRef.current={...operationRef.current,[operation.id]:operation};actions.set('acpOperations',operationRef.current)
      return run('prompt',{id:operation.id,operationId:operation.operationId,prompt:operation.prompt})
    }
    if(transport==='headless'&&LegacyView)return h(LegacyView,{useStore,actions,execute:legacyExecute})
    const authUrl=safeAuthUrl(login?.url),loginActive=login&&(!['succeeded','cancelled','failed','error','idle'].includes(login.status)||login.cleanupConfirmed!==true),loginInput=login?.status==='awaiting-input'
    return h('div',{style:styles.root},h('h2',null,t.title),h('p',null,t.hint),
      transport===null?h('p',{role:'status'},t.loading):null,
      h('div',{style:styles.row},button(t.new,()=>run('connect'),!!busy||transport!=='acp'),button(t.refresh,()=>run('status',selected?{id:selected}:{}),!!busy||transport!=='acp'),button(t.doctor,()=>run('doctor'),!!busy||transport!=='acp')),
      message?h('p',{role:'alert'},message):null,
      diagnostic?h('details',{open:true},h('summary',null,t.doctor),h('pre',{style:styles.pre},JSON.stringify(diagnostic,null,2))):null,
      h('section',{style:styles.box},h('h3',null,t.login),h('div',{style:styles.row},button(t.login,()=>run('login-start'),!!busy||!!loginActive||transport!=='acp'),loginActive?button(t.loginCancel,()=>{setLoginCode('');return run('login-cancel')}):null),
        login?h('p',{role:'status'},login.status):null,authUrl&&loginActive?h('a',{href:authUrl,target:'_blank',rel:'noopener noreferrer'},t.openLogin):null,
        loginInput?field(t.loginCode,h('input',{type:'password',autoComplete:'off',spellCheck:false,value:loginCode,onChange:event=>setLoginCode(event.target.value),'aria-label':t.loginCode})):null,
        loginInput?button(t.loginSubmit,()=>{const input=loginCode;setLoginCode('');return run('login-submit',{input})},!loginCode.trim()||!!busy):null,
        login?.status==='succeeded'?h('p',null,t.loginDone):null,login?.message?h('p',null,login.message):null,login?.error?h('p',{role:'alert'},typeof login.error==='string'?login.error:login.error.message):null),
      field(t.sessions,h('select',{'aria-label':t.sessions,value:selected,onChange:event=>actions.set('acpSelectedId',event.target.value)},h('option',{value:''},'—'),sessions.map(item=>h('option',{key:item.id,value:item.id},item.id+' · '+item.status)))),
      snapshot?h(React.Fragment,null,
        h('section',{style:styles.box},h('p',null,t.source+': ',h('code',null,snapshot.sourceCwd)),h('p',null,t.worktree+': ',h('code',null,snapshot.cwd)),h('p',null,t.branch+': '+snapshot.branch),h('p',null,t.base+': ',h('code',null,snapshot.baseCommit)),
          h('p',{role:'status'},t.status+': '+snapshot.status+' · '+t.connection+': '+snapshot.connection),h('p',null,t.root+': '+(snapshot.prompt?.state??'—')+(snapshot.prompt?.stopReason?' / '+snapshot.prompt.stopReason:'')),
          h('p',null,t.known+': '+t.tools+' '+(snapshot.knownWork?.tools??0)+' · '+t.permissions+' '+(snapshot.knownWork?.permissions??0)+' · '+t.children+' '+(snapshot.knownWork?.children??0)+(snapshot.knownWork?.unknown?' · '+t.unknown:'')),
          h('p',null,t.clean+': '+(snapshot.cleanup?.process??t.unknown)+' / '+(snapshot.cleanup?.session??t.unknown)),h('small',null,t.detached),
          h('div',{style:styles.row},button(t.resume,()=>run('resume',{id:selected}),!!busy||snapshot.connection==='connected'),button(t.stop,()=>run('cancel',{id:selected}),snapshot.connection!=='connected'),button(t.disconnect,()=>run('disconnect',{id:selected}),!!busy||snapshot.connection!=='connected')),h('small',null,t.retained),snapshot.error?h('p',{role:'alert'},snapshot.error.message):null,snapshot.modelProblem?h('p',{role:'alert'},snapshot.modelProblem):null),
        h(Configuration,{snapshot,run,busy:!!busy}),
        ...(snapshot.permissions??[]).map(permission=>h('section',{key:permission.requestId,style:styles.box},h('h3',null,t.permission),h('p',null,permission.toolCall?.title??permission.requestId),h('pre',{style:styles.pre},JSON.stringify(permission.toolCall?.rawInput??{},null,2)),
          h('div',{style:styles.row},...(permission.options??[]).map(option=>button(option.name,()=>run('permission',{id:selected,requestId:permission.requestId,optionId:option.optionId}),false,option.optionId)),button(t.dismiss,()=>run('permission',{id:selected,requestId:permission.requestId,optionId:null}))))),
        field(t.prompt,h('textarea',{'aria-label':t.prompt,value:draft.acpDraft??'',rows:5,onChange:event=>actions.set('acpDraft',event.target.value),onPaste:event=>{
          if(!imageEnabled)return
          const files=[...(event.clipboardData?.items??[])].filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean)
          if(files.length){event.preventDefault();return addImages(files)}
        }})),
        imageEnabled?h('div',null,field(t.images,h('input',{type:'file',accept:imageTypes.join(','),multiple:true,disabled:attaching,'aria-label':t.images,onChange:event=>{const files=[...(event.target.files??[])];event.target.value='';return addImages(files)}})),h('small',null,t.imageHint)):null,
        attaching?h('p',{role:'status'},t.imageReading):null,
        attachments.length?h('ul',null,...attachments.map(item=>h('li',{key:item.id},item.name+' · '+item.size+' B · SHA-256 '+item.sha256,button(t.imageRemove,()=>{const next=attachmentRef.current.filter(value=>value.id!==item.id);attachmentRef.current=next;actions.set('acpAttachments',next)},false,item.id)))):null,
        h('div',{style:styles.row},button(t.send,send,!snapshot.canPrompt||(!draft.acpDraft?.trim()&&!attachments.length)||!!busy||attaching||!!uncertain||attachments.length>0&&!imageEnabled),uncertain?button(t.reconcile,()=>run('status',{id:selected}),!!busy):null),
        uncertain?h('div',{role:'status'},h('p',null,t.uncertain+' '+uncertain.operationId),...(uncertain.attachments??[]).map(item=>h('p',{key:item.id},item.name+' · SHA-256 '+item.sha256))):null,
        snapshot.historyTruncated?h('p',null,t.history):null,
        h('section',null,h('h3',null,t.transcript),...(snapshot.messages??[]).map(item=>h('article',{key:item.id,style:styles.box},h('strong',null,item.role==='user'?t.user:item.role==='thought'?t.thought:t.assistant),h(Content,{blocks:item.content?.length?item.content:[{type:'text',text:item.text??''}]})))),
        (snapshot.tools??[]).length?h('section',null,h('h3',null,t.tools),...snapshot.tools.map(tool=>h('details',{key:(tool.sessionId??'')+':'+tool.toolCallId},h('summary',null,tool.title+' · '+(tool.status??t.unknown)),h(ToolContent,{items:tool.content})))):null,
        (snapshot.plan??[]).length?h('section',null,h('h3',null,t.plan),h('ul',null,...snapshot.plan.map((entry,index)=>h('li',{key:index},entry.content+' · '+entry.status)))):null,
        (snapshot.children??[]).length?h('section',null,h('h3',null,t.children),h('pre',{style:styles.pre},JSON.stringify(snapshot.children,null,2))):null,
        snapshot.usage?h('details',null,h('summary',null,'Usage'),h('pre',{style:styles.pre},JSON.stringify(snapshot.usage,null,2))):null,
      ):h('p',null,t.empty))
  }
  return {
    inject:['slots','remote'],
    apply(ctx,options={}) {
      let disposed=false
      const bindings=new WeakMap(),bindingSet=new Set()
      const cleanup=()=>{disposed=true;for(const binding of bindingSet)binding.active=false;bindingSet.clear()}
      if(typeof ctx.effect==='function')ctx.effect(()=>cleanup)
      else ctx.on?.('dispose',cleanup)
      const namespace='antigravityAcp',packageName=options.packageName??'@ckanner/dsh-subagent-antigravity'
      const viewId=options.viewId??'antigravity',commandName=options.commandName??viewId
      // rc.3 deliberately keeps command-only Chat sessions on the blank Hero.
      // A real human entry command contributes this view's own display activity;
      // it neither fabricates a turn nor starts the parent DSH model.
      ctx.inject(['uiSession','uiConversation'],scope=>{
        const conversation=scope.uiConversation,sessionUi=scope.uiSession
        if(!conversation||!sessionUi)return
        conversation.views.register({target:viewId,create:()=>{
          let opened=false
          return {empty:false,replace:({nodes})=>opened=opened||nodes.length>0,apply:({upserts})=>opened=opened||upserts.length>0}
        },isActive:value=>value===true})
        conversation.events.register({kind:packageName+'#'+viewId+'-entry',target:viewId,
          match:event=>event.type==='command/run'&&event.data?.name===commandName&&event.data?.source?.kind==='user'?{id:String(event.data.commandId),role:'start'}:null,
          start:()=>true,update:()=>true,
          buildViewNode:context=>context.state?{key:context.key,kind:context.kind,id:context.id,target:viewId,data:{opened:true}}:null,
        })
        sessionUi.provide({resolve:binding=>{conversation.binding(binding).activate(viewId);return {}}})
      })
      const ready=ctx.remote.$mount({package:packageName,descriptors:[{
        id:packageName+'#'+namespace+'/action',service:namespace,namespace,method:'action',invocation:{kind:'direct'},
        parameters:[{name:'agent',wire:'agentId',source:'lookup',lookup:'agent',codec:codec('SessionId',sessionId)},{name:'input',wire:'input',source:'json',codec:codec('AcpAction',parseInput)}],
        cancellation:{parameter:'signal'},result:{...codec('AcpResult',parseResult),decode:parseResult},
      }]}).then(async()=>{
        let call
        const consumer=ctx.inject(['remote.antigravityAcp'],scope=>{call=(id,input)=>scope.remote.antigravityAcp.action(id,input)})
        try{await consumer;if(disposed||!call)throw new Error(t.unavailable);return call}catch(error){await consumer?.dispose?.();throw error}
      })
      ready.catch(()=>{})
      ctx.slots.inject('conversation.view',()=>ctx.slots.register({name:'conversation.view',id:viewId,order:options.order??1001,label:()=>t.title,store:createStore(options.initialState),inject:(id,actions)=>{
        let binding=bindings.get(actions)
        if(binding&&binding.sessionId===id)return binding
        if(binding){binding.active=false;bindingSet.delete(binding);for(const [key,value] of Object.entries(createStore(options.initialState).spec.init()))actions.set(key,value)}
        binding={active:true,sessionId:id,legacyView:options.legacyView,legacyExecute:options.legacyExecute?.(id),execute:async input=>{
          if(disposed||!binding.active)throw new Error('This Antigravity view binding has ended')
          const call=await ready
          if(disposed||!binding.active)throw new Error('This Antigravity view binding has ended')
          const reply=await call(id,parseInput(input))
          if(disposed||!binding.active)throw new Error('This Antigravity view binding has ended')
          if(!reply?.ok){const err=new Error(reply?.error?.message??t.unavailable);if(reply?.error?.code)err.code=reply.error.code;throw err}
          return parseResult(reply.value)
        }}
        bindings.set(actions,binding);bindingSet.add(binding);return binding
      }},View))
    },
  }
}
