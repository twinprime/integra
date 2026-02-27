export interface FunctionMatch {
  senderId: string;
  receiverId: string;
  functionId: string;
  params: string;
  isUseCase: boolean;
  ucId?: string;
}

export function parseParticipants(
  spec: string
): Array<{ keyword: string; name: string; id: string; fromComp?: string }> {
  const results: Array<{ keyword: string; name: string; id: string; fromComp?: string }> = [];
  const lines = spec.split('\n');
  // Matches: actor "Name" as id  OR  actor "Name" from compId as id
  const re = /^\s*(actor|component)\s+"([^"]+)"(?:\s+from\s+(\S+))?\s+as\s+(\S+)/;
  for (const line of lines) {
    const m = re.exec(line);
    if (m) {
      results.push({
        keyword: m[1],
        name: m[2],
        fromComp: m[3],
        id: m[4],
      });
    }
  }
  return results;
}

export function parseMessages(spec: string): FunctionMatch[] {
  const results: FunctionMatch[] = [];
  const lines = spec.split('\n');
  // Matches: sender->>receiver: UseCase:ucId  OR  sender->>receiver: funcId(params)
  const msgRe = /^\s*(\S+)->>(\S+):\s*(.+)/;
  const ucRe = /^UseCase:(\S+)$/;
  const fnRe = /^(\S+)\(([^)]*)\)$/;
  for (const line of lines) {
    const m = msgRe.exec(line);
    if (!m) continue;
    const [, senderId, receiverId, body] = m;
    const ucMatch = ucRe.exec(body.trim());
    if (ucMatch) {
      results.push({ senderId, receiverId, functionId: body.trim(), params: '', isUseCase: true, ucId: ucMatch[1] });
      continue;
    }
    const fnMatch = fnRe.exec(body.trim());
    if (fnMatch) {
      results.push({ senderId, receiverId, functionId: fnMatch[1], params: fnMatch[2], isUseCase: false });
    } else {
      results.push({ senderId, receiverId, functionId: body.trim(), params: '', isUseCase: false });
    }
  }
  return results;
}
