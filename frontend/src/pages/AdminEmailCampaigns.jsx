import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, Mail, Plus, RefreshCw, Send, Users } from 'lucide-react';
import apiClient from '../api/client';
import { useToast } from '../ui/Toast';

const fields = [
  ['subject', 'Subject'], ['preheader', 'Preheader'], ['heading', 'Heading'],
  ['message', 'Message'], ['ctaLabel', 'CTA label'], ['ctaUrl', 'CTA URL'], ['closing', 'Closing'],
];

const statusTone = {
  draft: 'bg-gray-100 text-gray-700', queued: 'bg-blue-50 text-blue-700', sending: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700', partial: 'bg-orange-50 text-orange-700', failed: 'bg-red-50 text-red-700',
};

const getMissingConfig = (config) => config ? [
  !config.enabled && 'EMAIL_CAMPAIGN_ENABLED=true',
  !config.resendConfigured && 'RESEND_API_KEY',
  !config.unsubscribeConfigured && 'MARKETING_UNSUBSCRIBE_SECRET',
  !config.senderValid && 'a valid MARKETING_FROM',
  !config.senderNameValid && 'a valid MARKETING_FROM_NAME',
  !config.publicUrlsValid && 'valid FRONTEND_URL and BACKEND_URL',
].filter(Boolean) : [];

function AdminEmailCampaigns() {
  const { error: showError, success: showSuccess, warning: showWarning } = useToast();
  const configurationToastShown = useRef(false);
  const [campaigns, setCampaigns] = useState([]);
  const [config, setConfig] = useState(null);
  const [current, setCurrent] = useState(null);
  const [audience, setAudience] = useState([]);
  const [stats, setStats] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [deliveries, setDeliveries] = useState([]);
  const [deliveryPagination, setDeliveryPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  const loadCampaigns = async () => {
    const { data } = await apiClient.get('/admin/email-campaigns');
    setCampaigns(data.campaigns);
    setConfig(data.config);
    setCurrent((existing) => existing
      ? data.campaigns.find((item) => item.id === existing.id) || existing
      : data.campaigns.find((item) => item.state === 'draft') || data.campaigns[0] || null);
    return data;
  };
  const loadAudience = async () => {
    const { data } = await apiClient.get('/admin/email-campaigns/audience');
    setAudience(data.audience);
    setStats(data.stats);
  };
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCampaigns(), loadAudience()])
      .then(([campaignData]) => {
        if (cancelled || configurationToastShown.current) return;
        configurationToastShown.current = true;
        const campaignConfig = campaignData.config;
        const missing = getMissingConfig(campaignConfig);
        if (missing.length) {
          showWarning(`Campaign sending is disabled. Missing backend configuration: ${missing.join(', ')}.`, 8000);
        } else if (!campaignConfig.webhookConfigured) {
          showWarning('Campaign sending is available, but delivery and bounce tracking will remain pending until the Resend webhook is configured.', 8000);
        } else {
          showSuccess('Campaign sending is configured.');
        }
      })
      .catch(() => { if (!cancelled) showError("Couldn't load email campaigns."); });
    return () => { cancelled = true; };
  }, [showError, showSuccess, showWarning]);

  const loadDeliveries = async (campaignId, page = 1) => {
    const { data } = await apiClient.get(`/admin/email-campaigns/${campaignId}/deliveries?page=${page}&limit=20`);
    setDeliveries(data.deliveries); setDeliveryPagination(data.pagination);
  };
  useEffect(() => {
    if (!current || !['queued', 'sending'].includes(current.state)) return undefined;
    const timer = setInterval(() => {
      loadCampaigns().catch(() => {});
      loadDeliveries(current.id, deliveryPagination.page).catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [current, deliveryPagination.page]);

  const selected = useMemo(() => new Set((current?.selectedUserIds || []).map(String)), [current]);
  const createCampaign = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.post('/admin/email-campaigns', { name: 'AI Tutor announcement' });
      setCurrent(data.campaign); setCampaigns((items) => [data.campaign, ...items]);
    } catch (error) { showError(error.response?.data?.message || "Couldn't create campaign."); }
    finally { setBusy(false); }
  };
  const updateContent = (key, value) => setCurrent((item) => ({ ...item, content: { ...item.content, [key]: value } }));
  const save = async (extra = {}) => {
    setBusy(true);
    try {
      const { data } = await apiClient.patch(`/admin/email-campaigns/${current.id}`, {
        name: current.name, content: current.content, selectedUserIds: current.selectedUserIds, ...extra,
      });
      setCurrent(data.campaign); await loadCampaigns(); showSuccess('Draft saved.'); return data.campaign;
    } catch (error) { showError(error.response?.data?.message || "Couldn't save draft."); return null; }
    finally { setBusy(false); }
  };
  const renderPreview = async () => {
    try { const { data } = await apiClient.post('/admin/email-campaigns/preview', { content: current.content, recipientName: 'Junaid' }); setPreview(data); }
    catch (error) { showError(error.response?.data?.message || "Couldn't render preview."); }
  };
  const toggle = (id) => setCurrent((item) => {
    const values = new Set((item.selectedUserIds || []).map(String));
    values.has(String(id)) ? values.delete(String(id)) : values.add(String(id));
    return { ...item, selectedUserIds: [...values] };
  });
  const selectEligible = () => setCurrent((item) => ({ ...item, selectedUserIds: audience.filter((row) => row.eligible).map((row) => row.userId) }));
  const sendTest = async () => {
    setBusy(true); try { const saved = await save(); if (!saved) return; const { data } = await apiClient.post(`/admin/email-campaigns/${current.id}/test`); showSuccess(data.message); }
    catch (error) { showError(error.response?.data?.message || "Couldn't send test."); } finally { setBusy(false); }
  };
  const queue = async () => {
    setBusy(true); try {
      const saved = await save(); if (!saved) return;
      const { data } = await apiClient.post(`/admin/email-campaigns/${current.id}/queue`, { confirmation });
      setCurrent(data.campaign); setConfirmation(''); await loadCampaigns(); showSuccess('Campaign queued safely.');
    } catch (error) { showError(error.response?.data?.message || "Couldn't queue campaign."); } finally { setBusy(false); }
  };
  const openCampaign = async (campaign) => {
    setCurrent(campaign); setPreview(null); setDeliveries([]);
    if (campaign.state !== 'draft') {
      await loadDeliveries(campaign.id);
    }
  };

  const missingConfig = getMissingConfig(config);
  const configured = Boolean(config) && missingConfig.length === 0;
  return <div className="min-h-screen bg-light-bg p-4 font-family-poppins sm:p-6 lg:p-8">
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-black sm:text-3xl">Email Campaigns</h1><p className="mt-1 text-sm text-gray">Create consent-based updates and monitor every recipient safely.</p></div><button onClick={createCampaign} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-teal-button px-4 py-3 font-semibold text-white disabled:opacity-50"><Plus size={18}/>New campaign</button></div>
      <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="self-start rounded-2xl border border-[#E5E5E5] bg-white p-3 shadow-sm xl:sticky xl:top-6"><h2 className="px-2 py-2 font-bold">Campaign history</h2><div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-15rem)]">{campaigns.map((item) => <button key={item.id} onClick={() => openCampaign(item)} className={`w-full rounded-xl border p-3 text-left ${current?.id === item.id ? 'border-teal bg-light-teal' : 'border-transparent hover:bg-light-bg'}`}><div className="flex items-start justify-between gap-2"><span className="font-semibold text-black">{item.name}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${statusTone[item.state]}`}>{item.state}</span></div><p className="mt-1 truncate text-xs text-gray">{item.content?.subject}</p><p className="mt-2 text-[11px] text-gray">{new Date(item.createdAt).toLocaleString()}</p></button>)}{!campaigns.length && <p className="p-6 text-center text-sm text-gray">No campaigns yet.</p>}</div></aside>
        {!current ? <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-[#D7D7D7] bg-white p-8 text-center"><div><Mail className="mx-auto text-teal" size={42}/><h2 className="mt-4 text-xl font-bold">Create your first campaign</h2><p className="mt-2 text-sm text-gray">The AI Tutor template is ready to customise.</p></div></section> : <main className="space-y-5">
          {current.state === 'draft' ? <>
            <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-2"><Mail className="text-teal"/><h2 className="text-xl font-bold">Campaign content</h2></div><label className="text-sm font-semibold">Internal name<input value={current.name} onChange={(e) => setCurrent({...current, name:e.target.value})} className="mt-1 w-full rounded-xl border border-[#D7D7D7] px-4 py-3 outline-none focus:border-teal"/></label><div className="mt-4 grid gap-4 sm:grid-cols-2">{fields.map(([key,label]) => <label key={key} className={`text-sm font-semibold ${['message','closing'].includes(key)?'sm:col-span-2':''}`}>{label}{['message','closing'].includes(key)?<textarea rows={key==='message'?6:3} value={current.content?.[key]||''} onChange={(e)=>updateContent(key,e.target.value)} className="mt-1 w-full rounded-xl border border-[#D7D7D7] px-4 py-3 font-normal outline-none focus:border-teal"/>:<input value={current.content?.[key]||''} onChange={(e)=>updateContent(key,e.target.value)} className="mt-1 w-full rounded-xl border border-[#D7D7D7] px-4 py-3 font-normal outline-none focus:border-teal"/>}</label>)}</div><p className="mt-3 text-xs text-gray">Use <code>{'{{firstName}}'}</code> for safe name personalisation. Other template tokens are rejected.</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={()=>save()} disabled={busy} className="rounded-xl bg-dark-blue px-4 py-2.5 font-semibold text-white">Save draft</button><button onClick={renderPreview} className="inline-flex items-center gap-2 rounded-xl border border-[#D7D7D7] px-4 py-2.5 font-semibold"><Eye size={17}/>Preview</button><button onClick={sendTest} disabled={busy||!configured} className="inline-flex items-center gap-2 rounded-xl border border-teal px-4 py-2.5 font-semibold text-teal disabled:opacity-40"><Send size={17}/>Send test to me</button></div></section>
            <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><Users className="text-teal"/>Audience</h2><p className="mt-1 text-xs text-gray">{config?.legacyAudienceEnabled ? 'Launch audience mode: users without recorded verification or opt-in are included. Admin, suspended, invalid, opted-out and suppressed users remain excluded.' : 'Explicit opt-in only. Admin, suspended, unverified, unknown, opted-out and suppressed users are excluded.'}</p></div><button onClick={selectEligible} className="rounded-lg bg-light-teal px-3 py-2 text-sm font-semibold text-teal">Select all eligible</button></div>{stats&&<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Eligible',stats.eligible],['Students',stats.students],['Teachers',stats.teachers],['Excluded',stats.excluded]].map(([label,value])=><div key={label} className="rounded-xl bg-light-bg p-3"><strong className="text-xl">{value}</strong><p className="text-xs text-gray">{label}</p></div>)}</div>}<div className="mt-4 max-h-72 overflow-auto rounded-xl border border-[#E5E5E5]">{audience.map((row)=><label key={row.userId} className={`flex items-center gap-3 border-b border-[#EEEEEE] p-3 last:border-0 ${row.eligible?'':'bg-gray-50 text-gray'}`}><input type="checkbox" disabled={!row.eligible} checked={selected.has(String(row.userId))} onChange={()=>toggle(row.userId)} className="h-4 w-4 accent-teal"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.recipientName}</p><p className="truncate text-xs">{row.normalizedEmail}</p></div><span className="text-[11px]">{row.eligible?[row.isStudent&&'Student',row.isTeacher&&'Teacher'].filter(Boolean).join(' + ')||'Member':row.skipReason.replaceAll('_',' ')}</span></label>)}</div><p className="mt-3 text-sm font-semibold">{selected.size} recipient{selected.size===1?'':'s'} selected</p></section>
            {preview&&<section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Exact server-rendered preview</h2><div className="rounded-lg bg-light-bg p-1">{['desktop','mobile','plain'].map(mode=><button key={mode} onClick={()=>setPreviewMode(mode)} className={`rounded-md px-3 py-2 text-xs font-semibold capitalize ${previewMode===mode?'bg-white shadow':''}`}>{mode}</button>)}</div></div>{previewMode==='plain'?<pre className="whitespace-pre-wrap rounded-xl bg-light-bg p-4 text-sm">{preview.text}</pre>:<div className="overflow-auto rounded-xl bg-[#E8EBF0] p-3"><iframe title="Email preview" sandbox="" srcDoc={preview.html} className={`mx-auto h-[620px] bg-white ${previewMode==='mobile'?'w-[360px] max-w-full':'w-full'}`}/></div>}</section>}
            <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><h2 className="text-xl font-bold">Final review & send</h2><div className="mt-4 rounded-xl bg-light-bg p-4 text-sm"><p><strong>Selected:</strong> {selected.size}</p><p className="mt-1"><strong>Audience:</strong> {config?.legacyAudienceEnabled ? 'launch mode includes users without recorded opt-in; explicit opt-outs remain excluded' : 'unknown consent is excluded'}</p><p className="mt-1"><strong>Queue:</strong> recipients are frozen and checked again immediately before send</p></div><label className="mt-4 block text-sm font-semibold">Type SEND CAMPAIGN<input value={confirmation} onChange={(e)=>setConfirmation(e.target.value)} className="mt-1 w-full rounded-xl border border-[#D7D7D7] px-4 py-3 outline-none focus:border-teal"/></label><button onClick={queue} disabled={busy||confirmation!=='SEND CAMPAIGN'||!configured||!selected.size} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-teal-button px-4 py-3 font-semibold text-white disabled:opacity-40"><CheckCircle2 size={18}/>Freeze audience and queue</button></section>
          </> : <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Delivery status</h2><p className="mt-1 text-sm text-gray">Provider acceptance is tracked separately from confirmed delivery. Active queues refresh every 10 seconds.</p></div><button onClick={()=>openCampaign(current)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw size={15}/>Refresh</button></div><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">{Object.entries(current.counts||{}).map(([label,value])=><div key={label} className="rounded-xl bg-light-bg p-3"><strong className="text-xl">{value}</strong><p className="text-xs capitalize text-gray">{label.replace(/([A-Z])/g,' $1')}</p></div>)}</div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">Recipient</th><th>Status</th><th>Attempts</th><th>Provider event</th><th>Reason / error</th></tr></thead><tbody>{deliveries.map(row=><tr key={row._id} className="border-b last:border-0"><td className="p-3"><strong>{row.recipientName}</strong><div className="text-xs text-gray">{row.normalizedEmail}</div></td><td className="capitalize">{row.status.replace('_',' ')}</td><td>{row.attempts}</td><td>{row.lastProviderEventType||'—'}</td><td className="max-w-52 truncate">{row.skippedReason||row.lastErrorMessage||'—'}</td></tr>)}</tbody></table></div>{deliveryPagination.pages>1&&<div className="mt-4 flex items-center justify-between text-sm"><button disabled={deliveryPagination.page<=1} onClick={()=>loadDeliveries(current.id,deliveryPagination.page-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {deliveryPagination.page} of {deliveryPagination.pages} · {deliveryPagination.total} recipients</span><button disabled={deliveryPagination.page>=deliveryPagination.pages} onClick={()=>loadDeliveries(current.id,deliveryPagination.page+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}</section>}
        </main>}
      </div>
    </div>
  </div>;
}

export default AdminEmailCampaigns;

