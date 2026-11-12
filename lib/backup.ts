import {type Data,statuses} from './domain';
export function validateBackup(raw:unknown):asserts raw is Data{
 const d=raw as Data;const str=(s:unknown)=>typeof s==='string';const date=(s:unknown)=>str(s)&&/^\d{4}-\d{2}-\d{2}$/.test(s as string)&&!isNaN(Date.parse(s as string));const amount=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>0;
 if(!d||!Array.isArray(d.clients)||!Array.isArray(d.projects)||!Array.isArray(d.payments)||typeof d.demo!=='boolean')throw Error('Invalid backup');
 if(d.clients.length+d.projects.length+d.payments.length>20000)throw Error('Backup too large');
 for(const c of d.clients)if(!c||!['id','name','business','email','phone','notes'].every(k=>str(c[k as keyof typeof c])))throw Error('Invalid client');
 const clients=new Set(d.clients.map(c=>c.id)),projects=new Set(d.projects.map(p=>p.id));
 if(clients.size!==d.clients.length||projects.size!==d.projects.length||new Set(d.payments.map(p=>p.id)).size!==d.payments.length)throw Error('Duplicate IDs');
 for(const p of d.projects)if(!p||!str(p.id)||!str(p.name)||!str(p.description)||!clients.has(p.clientId)||!amount(p.budget)||!date(p.deadline)||!statuses.includes(p.status)||!Array.isArray(p.tasks)||p.tasks.some(t=>!str(t.id)||!str(t.title)||typeof t.done!=='boolean')||new Set(p.tasks.map(t=>t.id)).size!==p.tasks.length)throw Error('Invalid project');
 for(const p of d.payments)if(!p||!str(p.id)||!str(p.note)||!projects.has(p.projectId)||!amount(p.amount)||!date(p.date))throw Error('Invalid payment');
 for(const p of d.projects)if(d.payments.filter(x=>x.projectId===p.id).reduce((n,x)=>n+x.amount,0)>p.budget)throw Error('Overpayment');
}
