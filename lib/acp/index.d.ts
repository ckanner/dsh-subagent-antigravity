export interface AcpContext { owner: string; workspace: string }
export type AcpContent = { type: 'text'; text: string }
  | { type: 'image'; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string }
  | { type: 'resource_link'; uri: string; name: string; mimeType?: string; description?: string }
  | { type: 'resource'; resource: { uri: string; text: string; mimeType?: string } }
export type AcpAction = { version: 2 } & (
  | { action: 'defaults' | 'doctor' | 'list' | 'connect' | 'login-start' | 'login-cancel' }
  | { action: 'status'; id?: string }
  | { action: 'resume' | 'cancel' | 'disconnect'; id: string }
  | { action: 'prompt'; id: string; operationId: string; prompt: AcpContent[] }
  | { action: 'permission'; id: string; requestId: string; optionId?: string | null }
  | { action: 'configure'; id: string; configId: string; value: string | boolean }
  | { action: 'login-submit'; input: string }
)
export interface AcpRuntimeIdentity { executable: string; version: string; sha256: string; binaryHashVerified: boolean; platform: string; architecture: string }
export interface AcpSessionSnapshot {
  protocol: 2; transport: 'official-cli-acp'; id: string; owner: string;
  sourceCwd: string; cwd: string; branch: string; baseCommit: string; revision: number;
  status: 'connecting' | 'ready' | 'prompting' | 'auth-required' | 'disconnected' | 'unknown' | 'error' | 'closing';
  connection: 'connected' | 'disconnected'; sessionId?: string; runtime: AcpRuntimeIdentity;
  canPrompt: boolean; modelProblem: string | null;
  prompt?: { operationId: string; state: 'pending' | 'completed' | 'unknown' | 'cancelled' | 'failed'; stopReason?: string };
  configOptions: Array<Record<string, unknown>>;
  messages: Array<{ id: string; sessionId: string; role: string; content: unknown[]; text: string }>;
  tools: Array<Record<string, unknown>>; children: Array<Record<string, unknown>>;
  permissions: Array<{ requestId: string; sessionId: string; toolCall: unknown; options: Array<{ optionId: string; name: string; kind: string }> }>;
  cleanup: { process: 'running' | 'exited' | 'unknown'; session: 'open' | 'closed' | 'unknown' };
  knownWork: { tools: number; permissions: number; children: number; unknown: boolean };
  error?: { code: string; message: string }; historyTruncated?: boolean;
  [key: string]: unknown;
}
export class AcpSessions {
  constructor(options?: { getConfig?: () => { command?: string; transport?: 'acp' | 'headless'; disposeGraceMs?: number }; stateRoot?: string });
  action(context: AcpContext, input: AcpAction): Promise<AcpSessionSnapshot | { protocol: 2; [key: string]: unknown }>;
  isActive(owner: string): boolean;
  stopOwner(owner: string): Promise<void>;
  dispose(): Promise<void>;
}
export function inspectAcpRuntime(options?: { command?: string; env?: Record<string, string | undefined>; cwd?: string; expectedIdentity?: AcpRuntimeIdentity; strictBinaryHash?: boolean }): Promise<AcpRuntimeIdentity & { env: Record<string, string>; identity: AcpRuntimeIdentity }>;
export const CLIENT_INFO: Readonly<{ name: string; title: string; version: string }>;
export const CLIENT_CAPABILITIES: Readonly<Record<string, unknown>>;
