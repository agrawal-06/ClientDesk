import { type Data, statuses, isCalendarDate, today } from './domain.ts';

export function validateBackup(raw: unknown): asserts raw is Data {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid workspace');
  const d = raw as Data;
  const str = (s: unknown) => typeof s === 'string';
  const id = (s: unknown) => str(s) && (s as string).trim().length > 0;
  const amount = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0 && Number(n) <= 100000000000;
  if (!Array.isArray(d.clients) || !Array.isArray(d.projects) || !Array.isArray(d.payments) || typeof d.demo !== 'boolean') throw new Error('Invalid workspace structure');
  if (d.clients.length + d.projects.length + d.payments.length > 20000) throw new Error('Workspace too large');
  for (const c of d.clients) {
    if (!c || !id(c.id) || !['name','business','email','phone','notes'].every(k => str(c[k as keyof typeof c]))) throw new Error('Invalid client');
  }
  for (const p of d.projects) {
    if (!p || !id(p.id) || !id(p.clientId) || !str(p.name) || !str(p.description) || !amount(p.budget) || !isCalendarDate(p.deadline) || !statuses.includes(p.status) || !Array.isArray(p.tasks)) throw new Error('Invalid project');
    if (p.tasks.length > 10000 || p.tasks.some(t => !t || !id(t.id) || !str(t.title) || typeof t.done !== 'boolean') || new Set(p.tasks.map(t => t.id)).size !== p.tasks.length) throw new Error('Invalid tasks');
  }
  for (const p of d.payments) {
    if (!p || !id(p.id) || !id(p.projectId) || !str(p.note) || !amount(p.amount) || !isCalendarDate(p.date) || p.date > today()) throw new Error('Invalid payment');
    if (p.voidedAt !== undefined && (!str(p.voidedAt) || !Number.isFinite(Date.parse(p.voidedAt)) || !id(p.voidReason))) throw new Error('Invalid void history');
    if (p.voidReason !== undefined && p.voidedAt === undefined) throw new Error('Missing void timestamp');
    if (p.replacesId !== undefined && !id(p.replacesId)) throw new Error('Invalid correction link');
  }
  const clients = new Set(d.clients.map(c => c.id));
  const projects = new Set(d.projects.map(p => p.id));
  const payments = new Map(d.payments.map(p => [p.id,p]));
  if (clients.size !== d.clients.length || projects.size !== d.projects.length || payments.size !== d.payments.length) throw new Error('Duplicate IDs');
  const replaced = new Set<string>();
  for (const p of d.projects) if (!clients.has(p.clientId)) throw new Error('Missing client');
  for (const p of d.payments) {
    if (!projects.has(p.projectId)) throw new Error('Missing project');
    if (p.replacesId) {
      const original = payments.get(p.replacesId);
      if (!original?.voidedAt || original.id === p.id || original.projectId !== p.projectId || replaced.has(original.id)) throw new Error('Invalid correction history');
      replaced.add(original.id);
      const seen = new Set([p.id]);
      let ancestor = original;
      while (ancestor) {
        if (seen.has(ancestor.id)) throw new Error('Cyclic correction history');
        seen.add(ancestor.id);
        if (!ancestor.replacesId) break;
        const previous = payments.get(ancestor.replacesId);
        if (!previous) throw new Error('Missing correction history');
        ancestor = previous;
      }
    }
  }
  for (const p of d.projects) {
    const received = d.payments.filter(x => x.projectId === p.id && !x.voidedAt).reduce((n,x) => n+x.amount,0);
    if (!Number.isSafeInteger(received) || received > p.budget) throw new Error('Overpayment');
  }
}
