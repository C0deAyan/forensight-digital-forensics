export type CustodyRecord = {
  id: string;
  evidence_id: string;
  user_id: string;
  action: string;
  sequence_no: number;
  previous_hash: string;
  record_payload: string;
  entry_hash: string;
  recorded_at: string;
};

export type ChainStatus =
  | { valid: true; checked: number }
  | { valid: false; checked: number; brokenAtSequence: number; reason: string };

const GENESIS_HASH = '0'.repeat(64);

async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyCustodyChain(records: CustodyRecord[]): Promise<ChainStatus> {
  const ordered = [...records].sort((a, b) => a.sequence_no - b.sequence_no);
  let expectedPrevious = GENESIS_HASH;

  for (let index = 0; index < ordered.length; index += 1) {
    const record = ordered[index];
    const expectedSequence = index + 1;

    if (record.sequence_no !== expectedSequence) {
      return { valid: false, checked: index, brokenAtSequence: expectedSequence, reason: 'A custody entry is missing from the sequence.' };
    }
    if (record.previous_hash !== expectedPrevious) {
      return { valid: false, checked: index, brokenAtSequence: record.sequence_no, reason: 'The link to the previous entry does not match.' };
    }
    const payloadPrefix = `${record.id}|${record.evidence_id}|${record.user_id}|${record.action}|`;
    if (!record.record_payload.startsWith(payloadPrefix)) {
      return { valid: false, checked: index, brokenAtSequence: record.sequence_no, reason: 'The entry details do not match the recorded content.' };
    }
    const recomputed = await sha256Text(`${record.previous_hash}|${record.record_payload}`);
    if (recomputed !== record.entry_hash) {
      return { valid: false, checked: index, brokenAtSequence: record.sequence_no, reason: 'The entry content was altered after it was recorded.' };
    }
    expectedPrevious = record.entry_hash;
  }

  return { valid: true, checked: ordered.length };
}
