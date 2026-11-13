'use client';
import {useState} from 'react';
import {validateBackup} from '../lib/backup';
import type {Data} from '../lib/domain';
export default function RecoveryScreen({recovery,stale,saving,error,refresh,save}:{
 recovery:{raw:string|null;message:string;readable:boolean};stale:boolean;saving:boolean;error:string;
 refresh:()=>void;save:(data:Data,preserve:boolean)=>Promise<boolean>;
}){
 const [fileError,setFileError]=useState('');
 return <main className="recovery"><section className="panel"><div className="eyebrow">WORKSPACE RECOVERY</div><h1>Your data needs a closer look.</h1><p>{recovery.message}</p>
 {recovery.raw!==null&&<button className="secondary" onClick={()=>{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([recovery.raw!],{type:'text/plain'}));a.href=url;a.download='clientdesk-original.txt';a.click();URL.revokeObjectURL(url)}}>Download original data</button>}
 <button className="secondary" onClick={refresh}>{stale?'Reload latest':'Retry loading'}</button>
 <fieldset disabled={!recovery.readable||stale||saving}><label className="importLabel">Restore a valid backup<input type="file" accept=".json,application/json" onChange={async event=>{
 const input=event.currentTarget;const file=input.files?.[0];if(!file)return;
 try{const data:unknown=JSON.parse(await file.text());validateBackup(data);setFileError('');if(confirm('Restore this backup? A copy of the original data will be kept on this device.'))await save(data,true)}catch{setFileError('This backup is invalid. The original data has not been changed.')}input.value='';
 }}/></label><button className="danger" onClick={async()=>{if(confirm('Start an empty workspace? A copy of the original data will be kept on this device.'))await save({clients:[],projects:[],payments:[],demo:false},true)}}>Start fresh</button></fieldset>
 {(fileError||error)&&<p role="alert" className="formError">{fileError||error}</p>}</section></main>;
}
