import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Contact, CheckCircle2, Eye, Mail, Plus, RefreshCw, Send, Users } from 'lucide-react';
import apiClient from '../api/client';
import { useToast } from '../ui/Toast';
import ExternalContactsPanel from '../components/EmailCampaigns/ExternalContactsPanel';

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
  const [workspace, setWorkspace] = useState('campaigns');
  const [externalAudience, setExternalAudience] = useState([]);
  const [audienceReview, setAudienceReview] = useState(null);

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
  const loadExternalAudience = async () => {
    const { data } = await apiClient.get('/admin/email-campaigns/external-contacts?page=1&limit=100');
    setExternalAudience(data.contacts);
  };
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCampaigns(), loadAudience(), loadExternalAudience()])
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
  const selectedExternal = useMemo(() => new Set((current?.selectedExternalContactIds || []).map(String)), [current]);
  const userSelectionKey = [...selected].sort().join(',');
  const externalSelectionKey = [...selectedExternal].sort().join(',');
  useEffect(() => {
    if (!current || current.state !== 'draft' || (!selected.size && !selectedExternal.size)) { setAudienceReview(null); return undefined; }
    const timer = setTimeout(() => {
      apiClient.post('/admin/email-campaigns/audience/resolve', {
        selectedUserIds: [...selected], selectedExternalContactIds: [...selectedExternal], source: current.audienceSource || 'users',
      }).then(({ data }) => setAudienceReview(data)).catch(() => setAudienceReview(null));
    }, 350);
    return () => clearTimeout(timer);
  // Selection keys intentionally replace mutable Set/object identities here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.state, current?.audienceSource, userSelectionKey, externalSelectionKey]);
  const createCampaign = async (initialExternalIds = []) => {
    setBusy(true);
    try {
      const { data } = await apiClient.post('/admin/email-campaigns', { name: 'Introduce SkillBridge', templateKey: 'introduce_skillbridge' });
      const selectedExternalContactIds = [...new Set(initialExternalIds.map(String))];
      const campaign = selectedExternalContactIds.length ? {
        ...data.campaign,
        selectedExternalContactIds,
        audienceSource: 'external',
      } : data.campaign;
      setCurrent(campaign); setCampaigns((items) => [campaign, ...items]);
      return campaign;
    } catch (error) { showError(error.response?.data?.message || "Couldn't create campaign."); return null; }
    finally { setBusy(false); }
  };
  const updateExternalSelection = async (ids) => {
    if (current?.state === 'draft') {
      setCurrent((item) => ({
        ...item,
        selectedExternalContactIds: ids,
        audienceSource: item.audienceSource === 'users' ? 'both' : (item.audienceSource || 'external'),
      }));
      return;
    }
    const campaign = await createCampaign(ids);
    if (campaign) showSuccess('A new draft campaign was created for the selected external contacts.');
  };
  const handlePrimaryCampaignAction = async () => {
    if (workspace === 'contacts' && current?.state === 'draft') {
      setWorkspace('campaigns');
      return;
    }
    const campaign = await createCampaign();
    if (campaign) setWorkspace('campaigns');
  };
  const updateContent = (key, value) => setCurrent((item) => ({ ...item, content: { ...item.content, [key]: value } }));
  const save = async (extra = {}) => {
    setBusy(true);
    try {
      const { data } = await apiClient.patch(`/admin/email-campaigns/${current.id}`, {
        name: current.name, content: current.content, selectedUserIds: current.selectedUserIds,
        selectedExternalContactIds: current.selectedExternalContactIds, audienceSource: current.audienceSource, ...extra,
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
  const toggleExternal = (id) => setCurrent((item) => {
    const values = new Set((item.selectedExternalContactIds || []).map(String));
    values.has(String(id)) ? values.delete(String(id)) : values.add(String(id));
    return { ...item, selectedExternalContactIds: [...values] };
  });
  const selectEligible = async () => {
    try {
      const source = current?.audienceSource || 'users';
      let externalIds = current?.selectedExternalContactIds || [];
      if (['external','both'].includes(source)) {
        const { data } = await apiClient.post('/admin/email-campaigns/external-contacts/resolve-audience', { filters: {} });
        externalIds = data.ids;
      }
      setCurrent((item) => ({
        ...item,
        selectedUserIds: ['users','both'].includes(source) ? audience.filter((row) => row.eligible).map((row) => row.userId) : [],
        selectedExternalContactIds: ['external','both'].includes(source) ? externalIds : [],
      }));
    } catch (error) { showError(error.response?.data?.message || "Couldn't resolve the filtered audience."); }
  };
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
  const canContinueContactDraft = workspace === 'contacts' && current?.state === 'draft';
  return <div className="min-h-screen bg-light-bg p-4 font-family-poppins sm:p-6 lg:p-8">
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-black sm:text-3xl">Email Campaigns</h1><p className="mt-1 text-sm text-gray">Create consent-based updates and monitor every recipient safely.</p></div><button onClick={handlePrimaryCampaignAction} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-teal-button px-4 py-3 font-semibold text-white disabled:opacity-50">{canContinueContactDraft?<><ArrowRight size={18}/>Continue to campaign</>:<><Plus size={18}/>New campaign</>}</button></div>
      <div className="mb-5 inline-flex w-full rounded-xl bg-white p-1 shadow-sm sm:w-auto"><button onClick={()=>setWorkspace('campaigns')} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold sm:flex-none ${workspace==='campaigns'?'bg-dark-blue text-white':'text-gray'}`}><Mail size={17}/>Campaigns</button><button onClick={()=>setWorkspace('contacts')} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold sm:flex-none ${workspace==='contacts'?'bg-dark-blue text-white':'text-gray'}`}><Contact size={17}/>External Contacts</button></div>
      {workspace==='contacts'?<ExternalContactsPanel selectedIds={current?.state==='draft'?(current.selectedExternalContactIds||[]):[]} onSelectionChange={updateExternalSelection} selectionBusy={busy} hasDraftCampaign={current?.state==='draft'}/>:<>
      <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="self-start rounded-2xl border border-[#E5E5E5] bg-white p-3 shadow-sm xl:sticky xl:top-6"><h2 className="px-2 py-2 font-bold">Campaign history</h2><div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-15rem)]">{campaigns.map((item) => <button key={item.id} onClick={() => openCampaign(item)} className={`w-full rounded-xl border p-3 text-left ${current?.id === item.id ? 'border-teal bg-light-teal' : 'border-transparent hover:bg-light-bg'}`}><div className="flex items-start justify-between gap-2"><span className="font-semibold text-black">{item.name}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${statusTone[item.state]}`}>{item.state}</span></div><p className="mt-1 truncate text-xs text-gray">{item.content?.subject}</p><p className="mt-2 text-[11px] text-gray">{new Date(item.createdAt).toLocaleString()}</p></button>)}{!campaigns.length && <p className="p-6 text-center text-sm text-gray">No campaigns yet.</p>}</div></aside>
        {!current ? <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-[#D7D7D7] bg-white p-8 text-center"><div><Mail className="mx-auto text-teal" size={42}/><h2 className="mt-4 text-xl font-bold">Create your first campaign</h2><p className="mt-2 text-sm text-gray">The AI Tutor template is ready to customise.</p></div></section> : <main className="space-y-5">
          {current.state === 'draft' ? <>
            <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-2"><Mail className="text-teal"/><h2 className="text-xl font-bold">Campaign content</h2></div><label className="text-sm font-semibold">Internal name<input value={current.name} onChange={(e) => setCurrent({...current, name:e.target.value})} className="mt-1 w-full rounded-xl border border-[#D7D7D7] px-4 py-3 outline-none focus:border-teal"/></label><div className="mt-4 grid gap-4 sm:grid-cols-2">{fields.map(([key,label]) => <label key={key} className={`text-sm font-semibold ${['message','closing'].includes(key)?'sm:col-span-2':''}`}>{label}{['message','closing'].includes(key)?<textarea rows={key==='message'?6:3} value={current.content?.[key]||''} onChange={(e)=>updateContent(key,e.target.value)} className="mt-1 w-full rounded-xl border border-[#D7D7D7] px-4 py-3 font-normal outline-none focus:border-teal"/>:<input value={current.content?.[key]||''} onChange={(e)=>updateContent(key,e.target.value)} className="mt-1 w-full rounded-xl border border-[#D7D7D7] px-4 py-3 font-normal outline-none focus:border-teal"/>}</label>)}</div><p className="mt-3 text-xs text-gray">Use <code>{'{{firstName}}'}</code> for safe name personalisation. Other template tokens are rejected.</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={()=>save()} disabled={busy} className="rounded-xl bg-dark-blue px-4 py-2.5 font-semibold text-white">Save draft</button><button onClick={renderPreview} className="inline-flex items-center gap-2 rounded-xl border border-[#D7D7D7] px-4 py-2.5 font-semibold"><Eye size={17}/>Preview</button><button onClick={sendTest} disabled={busy||!configured} className="inline-flex items-center gap-2 rounded-xl border border-teal px-4 py-2.5 font-semibold text-teal disabled:opacity-40"><Send size={17}/>Send test to me</button></div></section>
            <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><Users className="text-teal"/>Audience</h2><p className="mt-1 text-xs text-gray">Choose registered users, documented-permission external contacts, or both. Duplicate email addresses are merged server-side and restrictions always win.</p></div><button onClick={selectEligible} className="rounded-lg bg-light-teal px-3 py-2 text-sm font-semibold text-teal">Select all eligible results</button></div>
              <div className="mt-4 inline-flex w-full rounded-xl bg-light-bg p-1 sm:w-auto">{[['users','Registered users'],['external','External contacts'],['both','Both']].map(([value,label])=><button key={value} onClick={()=>setCurrent({...current,audienceSource:value})} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold sm:flex-none ${(current.audienceSource||'users')===value?'bg-white text-teal shadow-sm':'text-gray'}`}>{label}</button>)}</div>
              {['users','both'].includes(current.audienceSource||'users')&&<div className="mt-4"><h3 className="font-semibold">Registered users</h3>{stats&&<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Eligible',stats.eligible],['Students',stats.students],['Teachers',stats.teachers],['Excluded',stats.excluded]].map(([label,value])=><div key={label} className="rounded-xl bg-light-bg p-3"><strong className="text-xl">{value}</strong><p className="text-xs text-gray">{label}</p></div>)}</div>}<div className="mt-3 max-h-64 overflow-auto rounded-xl border">{audience.map((row)=><label key={row.userId} title={row.eligible?'':row.skipReason.replaceAll('_',' ')} className={`flex items-center gap-3 border-b p-3 last:border-0 ${row.eligible?'':'bg-gray-50 text-gray'}`}><input type="checkbox" disabled={!row.eligible} checked={selected.has(String(row.userId))} onChange={()=>toggle(row.userId)} className="h-4 w-4 accent-teal"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.recipientName}</p><p className="truncate text-xs">{row.normalizedEmail}</p></div><span className="text-[11px]">{row.eligible?[row.isStudent&&'Student',row.isTeacher&&'Teacher'].filter(Boolean).join(' + ')||'Member':row.skipReason.replaceAll('_',' ')}</span></label>)}</div></div>}
              {['external','both'].includes(current.audienceSource||'users')&&<div className="mt-4"><h3 className="font-semibold">External contacts</h3><p className="mt-1 text-xs text-gray">The list shows the first 100 contacts; “select all” resolves every eligible filtered result on the server.</p><div className="mt-3 max-h-64 overflow-auto rounded-xl border">{externalAudience.map((contact)=><label key={contact._id} title={contact.eligibility?.eligible?'':contact.eligibility?.skipReason?.replaceAll('_',' ')} className={`flex items-center gap-3 border-b p-3 last:border-0 ${contact.eligibility?.eligible?'':'bg-gray-50 text-gray'}`}><input type="checkbox" disabled={!contact.eligibility?.eligible} checked={selectedExternal.has(String(contact._id))} onChange={()=>toggleExternal(contact._id)} className="h-4 w-4 accent-teal"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{contact.name||'Unnamed contact'}</p><p className="truncate text-xs">{contact.normalizedEmail}</p></div><span className="text-[11px] capitalize">{contact.eligibility?.eligible?contact.contactType:contact.eligibility?.skipReason?.replaceAll('_',' ')}</span></label>)}{!externalAudience.length&&<p className="p-6 text-center text-sm text-gray">No external contacts yet. Import and review a CSV first.</p>}</div></div>}
              <p className="mt-3 text-sm font-semibold">{selected.size + selectedExternal.size} source record{selected.size + selectedExternal.size===1?'':'s'} selected; the final unique email count is resolved by the server.</p>
            </section>
            {preview&&<section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Exact server-rendered preview</h2><div className="rounded-lg bg-light-bg p-1">{['desktop','mobile','plain'].map(mode=><button key={mode} onClick={()=>setPreviewMode(mode)} className={`rounded-md px-3 py-2 text-xs font-semibold capitalize ${previewMode===mode?'bg-white shadow':''}`}>{mode}</button>)}</div></div>{previewMode==='plain'?<pre className="whitespace-pre-wrap rounded-xl bg-light-bg p-4 text-sm">{preview.text}</pre>:<div className="overflow-auto rounded-xl bg-[#E8EBF0] p-3"><iframe title="Email preview" sandbox="" srcDoc={preview.html} className={`mx-auto h-[620px] bg-white ${previewMode==='mobile'?'w-[360px] max-w-full':'w-full'}`}/></div>}</section>}
            <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><h2 className="text-xl font-bold">Final review & send</h2><div className="mt-4 rounded-xl bg-light-bg p-4 text-sm"><p><strong>Selected source records:</strong> {selected.size + selectedExternal.size}</p><p className="mt-1"><strong>Unique recipients now:</strong> {audienceReview?`${audienceReview.uniqueRecipients} total · ${audienceReview.eligibleRecipients} eligible · ${audienceReview.excludedRecipients} excluded`:'Resolving securely…'}</p><p className="mt-1"><strong>Audience:</strong> {current.audienceSource||'users'}; unknown external permission is always excluded</p><p className="mt-1"><strong>Queue:</strong> unique addresses and provenance are frozen, then current eligibility is checked again immediately before send</p></div><label className="mt-4 block text-sm font-semibold">Type SEND CAMPAIGN<input value={confirmation} onChange={(e)=>setConfirmation(e.target.value)} className="mt-1 w-full rounded-xl border border-[#D7D7D7] px-4 py-3 outline-none focus:border-teal"/></label><button onClick={queue} disabled={busy||confirmation!=='SEND CAMPAIGN'||!configured||!audienceReview?.eligibleRecipients} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-teal-button px-4 py-3 font-semibold text-white disabled:opacity-40"><CheckCircle2 size={18}/>Freeze audience and queue</button></section>
          </> : <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Delivery status</h2><p className="mt-1 text-sm text-gray">Provider acceptance is tracked separately from confirmed delivery. Active queues refresh every 10 seconds.</p></div><button onClick={()=>openCampaign(current)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw size={15}/>Refresh</button></div><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">{Object.entries(current.counts||{}).map(([label,value])=><div key={label} className="rounded-xl bg-light-bg p-3"><strong className="text-xl">{value}</strong><p className="text-xs capitalize text-gray">{label.replace(/([A-Z])/g,' $1')}</p></div>)}</div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">Recipient</th><th>Status</th><th>Attempts</th><th>Provider event</th><th>Reason / error</th></tr></thead><tbody>{deliveries.map(row=><tr key={row._id} className="border-b last:border-0"><td className="p-3"><strong>{row.recipientName}</strong><div className="text-xs text-gray">{row.normalizedEmail}</div></td><td className="capitalize">{row.status.replace('_',' ')}</td><td>{row.attempts}</td><td>{row.lastProviderEventType||'—'}</td><td className="max-w-52 truncate">{row.skippedReason||row.lastErrorMessage||'—'}</td></tr>)}</tbody></table></div>{deliveryPagination.pages>1&&<div className="mt-4 flex items-center justify-between text-sm"><button disabled={deliveryPagination.page<=1} onClick={()=>loadDeliveries(current.id,deliveryPagination.page-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {deliveryPagination.page} of {deliveryPagination.pages} · {deliveryPagination.total} recipients</span><button disabled={deliveryPagination.page>=deliveryPagination.pages} onClick={()=>loadDeliveries(current.id,deliveryPagination.page+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}</section>}
        </main>}
      </div></>}
    </div>
  </div>;
}

export default AdminEmailCampaigns;

