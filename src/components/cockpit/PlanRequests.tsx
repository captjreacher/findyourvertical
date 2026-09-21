import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
type RequestRow = {id:string;creator_profile_id:string;full_name:string;email:string;status:string;catalogue_status:string;catalogue_product_id:string|null;catalogue_plan_id:string|null;catalogue_price_version_id:string|null;created_at:string};
export function PlanRequests() {
  const [rows,setRows]=useState<RequestRow[]>([]); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;(supabase as any).rpc('fyv_list_plan_requests').then(({data,error}:any)=>{if(!active)return;if(error)setError(error.message);else setRows(data ?? []);setLoading(false);});return()=>{active=false;};},[]);
  return <section><h1 className="text-2xl font-bold">Personal Vertical Plan requests</h1>
    <p className="mt-3 text-sm text-charcoal-2">POA intake for scope and pricing review. Access is granted through Billing’s entitlement integration; a request does not grant access.</p>
    {loading ? <p className="mt-5" role="status">Loading requests…</p> : error ? <p className="mt-5 text-pink" role="alert">{error}</p> : !rows.length ? <p className="mt-5">No requests yet.</p> : <div className="mt-5 space-y-4">{rows.map(row=><article className="rounded-xl border border-white/10 bg-surface p-5" key={row.id}>
      <a href={`#/cockpit/creators/${row.creator_profile_id}`} className="font-semibold text-accent">{row.full_name}</a>
      <p className="mt-1 text-sm">{row.email}</p><p className="mt-2 text-sm">POA · {row.status} · {new Date(row.created_at).toLocaleDateString()}</p>
      <p className="mt-2 text-xs text-charcoal-2">Request: {row.id}</p>
      <p className="mt-2 text-sm text-charcoal-2">{row.catalogue_status==='resolved' ? `Catalogue: ${row.catalogue_product_id} / ${row.catalogue_plan_id} / ${row.catalogue_price_version_id}` : 'Billing catalogue configuration required before quoting.'}</p>
    </article>)}</div>}
  </section>;
}
